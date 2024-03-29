/**
 *	Author: JCloudYu
 *	Create: 2019/04/30
**/
const http	= require( 'http' );
const https = require( 'https' );



const {Drain} = require( '../kernel/helper.js' );
const CSP_STRING_VALUES = [ 'self', 'unsafe-inline', 'unsafe-eval', 'none', 'strict-dynamic' ];
const CSP_RULE_WHITELIST = [
	"child-src",
	"connect-src",
	"default-src",
	"font-src",
	"frame-src",
	"img-src",
	"manifest-src",
	"media-src",
	"object-src",
	"prefetch-src",
	"script-src",
	"style-src",
	"webrtc-src",
	"worker-src"
];

module.exports = async function handle_request(matched_proxy_handler, host, runtime, req, res) {
	const processors = Object.create(null);
	processors.cors	 = runtime._cors[host]||null;
	processors.csp	 = runtime._csp[host]||null;
	processors.proxy = matched_proxy_handler;
	

	
	let _should_continue = await handle_proxy_cors(processors, req, res);
	if ( !_should_continue ) return;
	
	return handle_proxy_request(processors, runtime.ssl_check, req, res);
};
async function handle_proxy_cors(processors, req, res) {
	if ( !processors.cors ) return true;
	
	const {proxy, cors} = processors;
	const PREFLIGHT = req.method === "OPTIONS";
	const CORS_INFO = Object.freeze({
		preflight: PREFLIGHT,
		resource: req.url_info,
		referer: req.headers['referer']||null,
		origin: req.headers['origin']||null,
		method: PREFLIGHT ? (req.headers['access-control-request-method']||null) : req.method
	});
	
	let _should_continue = true;
	const CORS_HEADERS	= Object.create(null);
	const CORS_RESULT	= await cors(CORS_INFO);
	
	
	
	if ( CORS_RESULT === false || Object(CORS_RESULT) !== CORS_RESULT ) {
		_should_continue = false;
	}
	else {
		// region [ Obtain corresponding CORS policies ]
		const {
			allow_origin, allow_methods, allow_headers, allow_credentials,
			expose_headers, max_age
		} = CORS_RESULT;
		// endregion
		
		
		
		// region [ Check CORS according to given policies ]
		if ( allow_origin !== undefined ) {
			if ( allow_origin !== "*" ) {
				_should_continue = _should_continue && ( req.headers['origin'] === allow_origin );
			}
			
			CORS_HEADERS[ 'Access-Control-Allow-Origin' ] = allow_origin;
		}
		
		if ( allow_methods !== undefined && Array.isArray(allow_methods) ) {
			_should_continue = _should_continue && ( allow_methods.indexOf(req.method) >= 0 );
			
			if ( PREFLIGHT ) {
				CORS_HEADERS[ 'Access-Control-Allow-Methods' ] = allow_methods.join(', ');
			}
		}
		
		if ( allow_headers !== undefined && Array.isArray(allow_headers) ) {
			if ( PREFLIGHT ) {
				CORS_HEADERS[ 'Access-Control-Allow-Headers' ] = allow_headers.join(', ');
			}
		}
		
		if ( allow_credentials !== undefined ) {
			CORS_HEADERS[ 'Access-Control-Allow-Credentials' ] = allow_credentials ? 'true' : 'false';
		}
		
		if ( expose_headers !== undefined && Array.isArray(expose_headers) ) {
			if ( PREFLIGHT ) {
				CORS_HEADERS[ 'Access-Control-Expose-Headers' ] = expose_headers.join(', ');
			}
		}
		
		if ( max_age !== undefined && Number.isInteger(max_age) ) {
			if ( PREFLIGHT ) {
				CORS_HEADERS[ 'Access-Control-Max-Age' ] = max_age;
			}
		}
		// endregion
	}
	
	
	
	// region [ Perform final CORS behavior ]
	// NOTE: The final proxy not be reached if the env is in preflight mode or the cors check fails
	if ( PREFLIGHT || !_should_continue ) {
		const now = (new Date()).toISOString();
		if ( !_should_continue ) {
			process.stdout.write(`\u001b[91m[${now}] 403 ${req.source_info} ${proxy.rule} Access to ${req.url_info.raw} is blocked by CORS!\u001b[39m\n`);
		}
		
		res.writeHead(_should_continue ? 200 : 403, CORS_HEADERS);
		res.end();
		return false
	}
	
	
	res._cors_headers = CORS_HEADERS;
	return true;
	// endregion
}
async function handle_proxy_csp(processors, req, res, proxy_response) {
	if ( !processors.csp ) return false;
	
	const csp = processors.csp;
	const req_info = Object.freeze({
		resource: req.url_info,
		referer: req.headers['referer']||null,
		origin: req.headers['origin']||null,
		method: req.method,
		statusCode: proxy_response.statusCode,
	});
	const result_policies = await csp(req_info);
	
	const policies = [];
	for( const policy_name of CSP_RULE_WHITELIST ) {
		if ( !result_policies[policy_name] ) continue;
		
		const policy_content = result_policies[policy_name].map((input)=>{
			return (CSP_STRING_VALUES.indexOf(input) >= 0 ? `'${input}'` : input);
		});
		policies.push(`${policy_name} ${policy_content.join( ' ' )}`);
	}
	
	const csp_policies = policies.join('; ');
	res._csp_headers = csp_policies ? { 'Content-Security-Policy':csp_policies } : {};
	// endregion
}
async function handle_proxy_request(processors, ssl_check, req, res) {
	const proxy = processors.proxy;
	const headers = Object.assign(Object.create(null), req.headers);
	
	
	
	let 
	handler, request_content,
	req_path = proxy.dst_path + req.url.substring(proxy.src_path.length);
	if ( req_path[0] !== "/" ) req_path = '/' + req_path;

	
	
	if ( !req.invisible_mode ) {
		// NOTE: Remove original incoming host header
		// NOTE: NodeJS will automatically check the certificate with the request host header
		// NOTE: This will cause errors in proxy's certificate
		headers[ 'X-Forwarded-Host' ]	= headers['x-forwarded-host']||headers['host']||'';
		headers[ 'X-Forwarded-Path' ]	= req.url;
		headers[ 'X-Forwarded-Proto' ]	= headers['x-forwarded-proto']||(req.use_ssl ? 'https' : 'http');
		
		if ( req.proxy_ip ) {
			headers[ 'X-Real-Ip' ] = req.proxy_ip;
		}
		else
		if ( req.hw_remote_socket ) {
			headers[ 'X-Real-Ip' ] = req.hw_remote_socket.address;
		}
		else {
			delete headers['x-real-ip'];
		}
		
		
		
		
		if ( req.proxy_port ) {
			headers[ 'X-Real-Port' ] = req.proxy_port;
		}
		else
		if ( req.hw_remote_socket ) {
			headers[ 'X-Real-Port' ] = req.hw_remote_socket.port;
		}
		else {
			delete headers['x-real-port'];
		}
	}
	
	
	
	delete headers[ 'host' ];
	
	
		
	if ( proxy.scheme === "https" ) {
		handler = https;
		request_content = {
			host:proxy.dst_host,
			port:proxy.dst_port,
			rejectUnauthorized: ssl_check,
			path:req_path,
			method:req.method,
			headers:headers,
		};
	}
	else
	if ( proxy.scheme === "http" ) {
		handler = http;
		request_content = {
			host:proxy.dst_host,
			port:proxy.dst_port,
			path:req_path,
			method:req.method,
			headers:headers
		};
	}
	else {
		handler = http;
		request_content = {
			socketPath:proxy.dst_path,
			path:req_path,
			method:req.method,
			headers:headers
		};
	}
	
	return new Promise((resolve)=>{
		const proxy_request = handler.request(request_content)
		.on( 'response', async(proxy_response)=>{
			const now = (new Date()).toISOString();
			
			
			
			try {
				await handle_proxy_csp(processors, req, res, proxy_response);
			} catch(e) {}
			
			
			
			const cors_headers	= res._cors_headers || {};
			const csp_headers	= res._csp_headers  || {};
			
			for( let header in cors_headers ) {
				if ( proxy_response.headers[header] === undefined ) {
					proxy_response.headers[header] = cors_headers[header];
				}
			}
			
			for( let header in csp_headers ) {
				if ( proxy_response.headers[header] === undefined ) {
					proxy_response.headers[header] = csp_headers[header];
				}
			}
			
			
			
			await (new Promise((resolve, reject)=>{
				res.writeHead(proxy_response.statusCode, proxy_response.headers);
				
				proxy_response.pipe(res);
				proxy_response.on('end', resolve);
				proxy_response.on('error', (e)=>reject({source:'req', error:e}));
				res.on('error', (e)=>reject({source:'res', error:e}));
			}))
			.catch((e)=>{
				proxy_response.pause();
				
				return Drain(proxy_response)
				.then(()=>{
					return Promise.reject(e)
				});
			});
			
			
			
			const color_code = (proxy_response.statusCode === 200) ? '\u001b[90m' : '\u001b[91m';
			process.stdout.write(`${color_code}[${now}] ${proxy_response.statusCode} ${req.source_info} ${proxy.rule}\u001b[39m\n`);
		})
		.on( 'error', (err)=>{
			const now = (new Date()).toISOString();
			console.log("298", err);
			res.writeHead(502, {'Content-Type':'text/plain'});
			res.end();
			
			
			
			process.stdout.write(`\u001b[91m[${now}] 502 ${req.source_info} ${proxy.rule} ${err.message}\u001b[39m\n`);
		});
		
		req.pipe( proxy_request );
		res.on( 'end', resolve );
	});
}
