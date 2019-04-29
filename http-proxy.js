/**
 *	Author: JCloudYu
 *	Create: 2019/04/30
**/
const http = require( 'http' );

module.exports = function(proxy, req, res) {
	return new Promise((resolve)=>{
		const proxy_request = http.request({
			hostname:proxy.dst_host,
			port:proxy.dst_port,
			path:req.url,
			method:req.method,
			headers:req.headers,
		})
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
