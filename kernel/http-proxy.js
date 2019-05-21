/**
 *	Author: JCloudYu
 *	Create: 2019/04/30
**/
const http	= require( 'http' );
const https = require( 'https' );

module.exports = async function handle_request(host, runtime, req, res) {
	const cors  = runtime._cors[host];
	const proxy = runtime._proxy[host];
	

	if ( cors ) {
		let _should_continue = await handle_proxy_cors(cors, req, res);
		if ( !_should_continue ) return;
	}
	
	return handle_proxy_request(proxy, runtime.ssl_check, req, res);
};
async function handle_proxy_cors(cors, req, res) {
	const PREFLIGHT = req.method === "OPTIONS";
	const CORS_INFO = Object.freeze({
		resource: req.url_info,
		origin: req.headers['origin']||null,
		method: PREFLIGHT ? (req.headers['access-control-request-method']||null) : req.method
	});
	
	
	
	// region [ Obtain corresponding CORS policies ]
	const {
		allow_origin, allow_methods, allow_headers, allow_credentials,
		expose_headers, max_age
	} = await cors(CORS_INFO);
	// endregion
	
	
	
	let _should_continue = true;
	// region [ Check CORS according to given policies ]
	const response_headers = Object.create(null);
	if ( allow_origin !== undefined ) {
		if ( allow_origin !== "*" ) {
			_should_continue = _should_continue && ( req.headers['origin'] === allow_origin );
		}
		response_headers[ 'Access-Control-Allow-Origin' ] = allow_origin;
	}
	
	if ( allow_methods !== undefined && Array.isArray(allow_methods) ) {
		_should_continue = _should_continue && ( allow_methods.indexOf(req.method) >= 0 );
		response_headers[ 'Access-Control-Allow-Methods' ] = allow_methods.join(', ');
	}
	
	if ( allow_headers !== undefined && Array.isArray(allow_headers) ) {
		response_headers[ 'Access-Control-Allow-Headers' ] = allow_headers.join(', ');
	}
	
	if ( allow_credentials !== undefined ) {
		response_headers[ 'Access-Control-Allow-Credentials' ] = allow_credentials ? 'true' : 'false';
	}
	
	if ( expose_headers !== undefined && Array.isArray(expose_headers) ) {
		response_headers[ 'Access-Control-Expose-Headers' ] = expose_headers.join(', ');
	}
	
	if ( max_age !== undefined && Number.isInteger(max_age) ) {
		response_headers[ 'Access-Control-Max-Age' ] = max_age;
	}
	// endregion
	
	
	
	// region [ Perform final CORS behavior ]
	// NOTE: The final proxy not be reached if the env is in preflight mode or the cors check fails
	if ( PREFLIGHT || !_should_continue ) {
		res.writeHead(_should_continue ? 200 : 403, response_headers);
		res.end();
		return false
	}
	
	return true;
	// endregion
}
async function handle_proxy_request(proxy, ssl_check, req, res) {
	const headers = Object.assign(Object.create(null), req.headers);
	headers[ 'X-Forwarded-Host' ] = headers['host'];
	delete headers[ 'host' ];



	return new Promise((resolve)=>{
		let handler, request_content;
		if ( proxy.scheme === "https" ) {
			handler = https;
			request_content = {
				host:proxy.dst_host,
				port:proxy.dst_port,
				rejectUnauthorized: ssl_check,
				path:req.url,
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
				path:req.url,
				method:req.method,
				headers:headers,
			};
		}
		else {
			handler = http;
			request_content = {
				socketPath:proxy.dst_path,
				path:req.url,
				method:req.method,
				headers:headers,
			};
		}
		
		
		
		const proxy_request = handler.request(request_content)
		.on( 'response', (proxy_response)=>{
			const now = (new Date()).toISOString();
			const source = req.socket;
			const source_info = `${source.remoteAddress}:${source.remotePort}`;
			
			if ( proxy_response.statusCode === 200 ) {
				process.stdout.write(`\u001b[90m[${now}] ${proxy_response.statusCode} ${source_info} ${proxy.src_host}::${proxy.dst_host}:${proxy.dst_port}\u001b[39m\n`);
			}
			else {
				process.stdout.write(`\u001b[91m[${now}] ${proxy_response.statusCode} ${source_info} ${proxy.src_host}::${proxy.dst_host}:${proxy.dst_port}\u001b[39m\n`);
			}
			
		
			res.writeHead(proxy_response.statusCode, proxy_response.headers);
			proxy_response.pipe(res);
		})
		.on( 'error', (err)=>{
			const now = (new Date()).toISOString();
			const source = req.socket;
			const source_info = `${source.remoteAddress}:${source.remotePort}`;
			process.stdout.write(`\u001b[91m[${now}] 502 ${source_info} ${proxy.src_host}::${proxy.dst_host}:${proxy.dst_port} ${err.message}\u001b[39m\n`);
			
		
			res.writeHead(502, {'Content-Type':'text/plain'});
			res.end();
		});
		
		req.pipe( proxy_request );
		res.on( 'end', resolve );
	});
}
