#!/usr/bin/env node
/**
 *	Author: JCloudYu
 *	Create: 2019/01/12
**/
(async()=>{
	"use strict";
	
	const http = require( 'http' );
	const path = require( 'path' );
	const fs   = require('fs');
	const {ParseURLPath, GenerateCORSProcessor} = require( './kernel/helper.js' );
	const http_proxy = require( './kernel/http-proxy.js' );
	
	const PROXY_RULE = /^proxy:([a-zA-Z0-9\-_.]+):(http|https|pipe)?:(.+)$/;
	const MIME_RULE	 = /^mime:(.+):(.+\/.+)$/;
	const CORS_RULE	 = /^cors:([a-zA-Z0-9\-_.]+):(.+)$/;
	const HOST_PORT_FORMAT = /^([a-zA-Z0-9\-_.]+):([0-9]+)$/;
	
	// region [ Process incoming arguments ]
	const CONFIGURABLE_FIELDS = [
		'host',
		'port',
		'unix',
		'ssl_check',
		'document_root',
		'rules'
	];
	const INPUT_CONF = Object.assign(Object.create(null), {
		host:'localhost',
		port:80,
		unix:null,
		ssl_check:true,
		document_root:process.cwd(),
		rules: [],
		
		_proxy_only: false,
		_proxy:Object.create(null),
		_mime:Object.create(null),
		_cors:Object.create(null),
		_connection:[],
	});
	let ARGV = process.argv;
	while ( ARGV.length > 0 ) {
		const option = ARGV.shift();
		switch(option) {
			case "--help":
				process.stderr.write( `Usage: lazy-http [OPTIONS]\n` );
				process.stderr.write( `OPTIONS:\n` );
				process.stderr.write( `        --help Show this instruction\n` );
				process.stderr.write( `    -h, --host [host] Set bind address\n` );
				process.stderr.write( `    -p, --port [port] Set listen port\n` );
				process.stderr.write( `    -u, --unix [path] Listen to unix socket. ( Note that the -u option will suppress listening on ip & port! )\n` );
				process.stderr.write( `    -d, --document_root [path] Set document root. Default value is current working directory!\n` );
				process.stderr.write( `    -r, --rule [RULE_URI] Add and apply the rule uri!\n` );
				process.stderr.write( `        --config [path] Path to the server configuration file\n` );
				process.stderr.write( `\nRULE_URI:\n` );
				process.stderr.write( `    proxy:[hostname]::[dst-host]:[dst-port] Proxy request for hostname to remote http server!\n` );
				process.stderr.write( `    proxy:[hostname]:http:[dst-host]:[dst-port] Proxy request for hostname to remote http server!\n` );
				process.stderr.write( `    proxy:[hostname]:https:[dst-host]:[dst-port] Proxy request for hostname to remote https server!\n` );
				process.stderr.write( `    proxy:[hostname]:unix:[dst-host]:[dst-port] Proxy request for hostname to local named pipe server!\n` );
				process.stderr.write( `    mime:[extension]:[mime-type] Add a relation between specified extension and mime-type!\n` );
				process.stderr.write( `    cors:[hostname]:[path-to-js-cors-handler] Attach a cors handler to a specific hostname!\n` );
				return;
			
			case "-u":
			case "--unix":
				INPUT_CONF.unix = ARGV.shift();
				break;
			
			case "-h":
			case "--host":
				INPUT_CONF.host = ARGV.shift();
				break;
			
			case "-p":
			case "--port":
				INPUT_CONF.port = ARGV.shift();
				break;
			
			case "-d":
			case "--document-root":
				INPUT_CONF.document_root = ARGV.shift();
				break;
				
			case "-r":
			case "--rule":
				INPUT_CONF.rules.push(ARGV.shift().trim());
				break;
				
			case "--proxy-only":
				INPUT_CONF._proxy_only = true;
				break;
			
			case "--config":
			{
				try {
					const config_path = path.resolve( process.cwd(), ARGV.shift().trim() );
					const config = JSON.parse(fs.readFileSync(config_path).toString('utf8'));
					if ( Object(config) !== config ) {
						process.stderr.write( "Server configuration file must be started with a json object!\n" );
						process.exit(1);
					}
					
					CONFIGURABLE_FIELDS.forEach((field)=>{
						if ( config[field] === undefined ) return;
						INPUT_CONF[field] = config[field];
					});
				}
				catch(e) {
					process.stderr.write( "Cannot load server configuration file!\n" );
					process.exit(1);
				}
				break;
			}
			
			default:
				break;
		}
	}
	// endregion
	
	// region [ Process the configurations read from incoming arguments ]
	// NOTE: Prepare incoming connection info
	if ( INPUT_CONF.unix ) {
		INPUT_CONF._connection.push(INPUT_CONF.unix);
	}
	else {
		INPUT_CONF._connection.push(INPUT_CONF.port, INPUT_CONF.host);
	}
	
	
	
	// NOTE: Processing rules
	for( const rule of INPUT_CONF.rules ) {
		const scheme_pos = rule.indexOf(':');
		const scheme = (scheme_pos >= 0) ? rule.substring(0, scheme_pos) : null;
		
		if ( scheme === "proxy" ) {
			const matches = rule.match(PROXY_RULE);
			if ( !matches ) {
				process.stderr.write( `Invalid rule format detected! Skipping... (${rule})` );
				continue;
			}
			
			const proxy_conf = Object.create(null),
				  [, hostname, dst_scheme, dst] = matches;
			
			if ( dst_scheme === "https" || dst_scheme === "http" ) {
				const matches = dst.match(HOST_PORT_FORMAT);
				if ( !matches ) {
					process.stderr.write( `Invalid hostname and port detected! Skipping... (${rule})` );
					continue;
				}
				
				const [, host, port] = matches;
				Object.assign(proxy_conf, {
					src_host: hostname,
					scheme: dst_scheme,
					dst_host: host,
					dst_port: port
				});
			}
			else {
				Object.assign(proxy_conf, {
					src_host: hostname,
					scheme: dst_scheme,
					dst_path: dst
				});
			}
			
			INPUT_CONF._proxy[hostname] = proxy_conf;
		}
		else if ( scheme === "mime" ) {
			const matches = rule.match(MIME_RULE);
			if ( !matches ) {
				process.stderr.write( `Invalid rule format detected! Skipping... (${rule})` );
				continue;
			}
			
			const [, ext, mime] = matches;
			INPUT_CONF._mime[ext] = mime;
		}
		else if ( scheme === "cors" ) {
			const matches = rule.match(CORS_RULE);
			if ( !matches ) {
				process.stderr.write( `Invalid rule format detected! Skipping... (${rule})` );
				continue;
			}
			
			const [, hostname, _handler_path] = matches;
			const handler_path = path.resolve(process.cwd(), _handler_path);
			try {
				let cors_processor = null;
				
				const cors_handler = require(handler_path);
				cors_processor = ( typeof cors_handler === "function" ) ? cors_handler : await GenerateCORSProcessor(cors_handler);
				
				if ( !cors_processor ) { throw new Error( "" ); }
				
				INPUT_CONF._cors[hostname] = cors_processor;
			} catch(e) {
				process.stderr.write( `Invalid rule format detected! Skipping... (${rule})` );
			}
		}
	}
	// endregion
	
	
	
	
	
	
	const DOCUMENT_ROOT = path.resolve( process.cwd(), INPUT_CONF.document_root||'' );
	const EXT_MIME_MAP = Object.assign( require('./kernel/mime-map.js'), INPUT_CONF._mime );
	const PROXY_ONLY = INPUT_CONF._proxy_only;
	
	http.createServer((req, res)=>{
		
		// region [ Parse hostname from host ]
		const RAW_HOST = `${req.headers.host}`.trim();
		const PORT_DIV = RAW_HOST.indexOf(':');
		const HOST = ( PORT_DIV < 0 ) ? RAW_HOST : RAW_HOST.substring(0, PORT_DIV).trim();
		// endregion
		
		// region [ Parse requested url ]
		let _raw_url = req.url || '';
		if ( _raw_url[0] !== "/" ) _raw_url = `/${_raw_url}`;
		req.url_info = ParseURLPath(_raw_url);
		// endregion
		
		
		
		// region [ Do check hostname based proxy ]
		if ( HOST && INPUT_CONF._proxy[HOST] !== undefined ) {
			return http_proxy(HOST, INPUT_CONF, req, res)
			.finally(()=>{
				if ( !res.finished ) {
					res.end();
				}
			});
		}
		// endregion
		
		
		
		if ( PROXY_ONLY ) {
			res.writeHead( 404, { "Content-Type": "text/plain" } );
			res.end( 'File not found.' );
			return;
		}
		
		// region [ Act as a default file server ]
		__ON_DEFAULT_HOST_REQUESTED(req, res)
		.then(()=>{
			const now = (new Date()).toISOString();
			const source = req.socket;
			const source_info = `${source.remoteAddress}:${source.remotePort}`;
			process.stdout.write(`\u001b[90m[${now}] 200 ${source_info} ${req.url}\u001b[39m\n`);
		})
		.catch((e)=>{
			const now = (new Date()).toISOString();
			const source = req.socket;
			const source_info = `${source.remoteAddress}:${source.remotePort}`;
			const err = (e === 403 ? 403 : ( e === 404 ? 404 : 500 ));
			process.stderr.write(`\u001b[91m[${now}] ${err} ${source_info} ${req.url}\u001b[39m\n`);
		})
		.finally(()=>{
			if ( !res.finished ) {
				res.end();
			}
		});
		// endregion
	}).listen(...INPUT_CONF._connection);
	
	
	
	
	
	
	async function __ON_DEFAULT_HOST_REQUESTED(req, res) {
		const REQUEST_URL = __GET_REQUEST_PATH(req.url);
		
		
		let targetURL = null;
		
		// NOTE: The request has been handled
		if ( targetURL === true ) { return; }
		if ( !targetURL ) {
			targetURL = `${DOCUMENT_ROOT}${REQUEST_URL}`;
		}
		
		
		
		// NOTE: If the path is a directory ( ended with a forward slash )
		if ( targetURL.substr(-1) === '/' ) {
			targetURL += 'index.html';
		}
		
		
		
		// NOTE: Resolve path to absolute path
		targetURL = path.resolve(DOCUMENT_ROOT, targetURL);
		
		
		
		// NOTE: Directory request prevention
		try {
			const stat = fs.statSync(targetURL);
			if( stat.isDirectory() ){
				res.writeHead(403, {'Content-Type': 'text/html'});
				res.write('It is forbidden to request a directory!');
				throw 403;
			}
		}
		catch(e) {
			if ( e !== 403 ) {
				res.writeHead(404, { 'Content-Type': 'text/html' });
				res.write( 'File not found.' );
				throw 404;
			}
			
			throw 403;
		}
		
		
		
		// NOTE: Detect MIME and respond with corresponding mime type
		let period_pos = targetURL.lastIndexOf('.');
		let ext = (period_pos > 0) ? targetURL.substring(period_pos+1) : '';
		let contentType = EXT_MIME_MAP[ext] || 'application/octet-stream';
		res.writeHead(200, { 'Content-Type': contentType });
		
		
		
		let readStream = fs.createReadStream(targetURL);
		await new Promise((resolve, reject)=>{
			readStream
			.on('end', resolve)
			.on('error', reject)
			.pipe(res);
		});
	}
	function __GET_REQUEST_PATH(input) {
		let pos = input.indexOf('#');
		if ( pos >= 0 ) {
			input = input.substring(0, pos);
		}
		
		pos = input.indexOf('?');
		if ( pos >= 0 ) {
			input = input.substring(0, pos);
		}
		
		return input;
	}
})().catch((e)=>{throw e;});
