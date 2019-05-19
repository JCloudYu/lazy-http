/**
 *	Author: JCloudYu
 *	Create: 2019/04/30
**/
const http	= require( 'http' );
const https = require( 'https' );

module.exports = function(host, runtime, req, res) {
	const headers = Object.assign(Object.create(null), req.headers);
	headers[ 'X-Forwarded-Host' ] = headers['host'];
	delete headers[ 'host' ];



	const proxy = runtime._proxy_map[host];
	return new Promise((resolve)=>{
		let handler, request_content;
		if ( proxy.scheme === "https" ) {
			handler = https;
			request_content = {
				host:proxy.dst_host,
				port:proxy.dst_port,
				rejectUnauthorized: runtime.ssl_check,
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
};
