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
	const {ParseURLPath, GenerateMatchProcessor, Drain, ParseContent} = require( './kernel/helper.js' );
	const http_proxy = require( './kernel/http-proxy.js' );
	
	const PROXY_RULE = /^proxy(:default)?:([a-zA-Z0-9\-_.]+)(\/|\/[^ ]+\/)?:(http|https|pipe)?:(.+)$/;
	const MIME_RULE	 = /^mime(:default)?:(.+):(.+\/.+)$/;
	const CORS_RULE	 = /^cors(:default)?:([a-zA-Z0-9\-_.]+):(.+)$/;
	const CSP_RULE	 = /^csp(:default)?:([a-zA-Z0-9\-_.]+):(.+)$/;
	const HOST_PORT_FORMAT = /^([a-zA-Z0-9\-_.]+):([0-9]+)$/;
	const CAMEL_CASE_PATTERN = /(\w)(\w*)(\W*)/g;
	const CAMEL_REPLACER = (match, $1, $2, $3, index, input )=>{
		return `${$1.toUpperCase()}${$2.toLowerCase()}${$3}`;
	};
	
	// region [ Process incoming arguments ]
	const WORKING_DIR = process.cwd();
	const INPUT_CONF = Object.assign(Object.create(null), {
		host:'localhost',
		port:80,
		unix:null,
		ssl_check:true,
		document_root:WORKING_DIR,
		rules: [],
		proxy_only:false,
		echo_server:false,
		
		_echo_server: false,
		_proxy_only: false,
		_proxy:Object.create(null),
		_proxy_default:null,
		_mime:Object.create(null),
		_cors:Object.create(null),
		_csp:Object.create(null),
		_connection:[],
	});
	let ARGV = process.argv.slice(2);
	
	while ( ARGV.length > 0 ) {
		const option = ARGV.shift().trim();
		switch(option) {
			case "-v":
			case "--version": {
				const {version} = require( './package.json' );
				process.stdout.write(`lazy-http@${version}\n`);
				process.exit(0);
				break;
			}
		
			case "-h":
			case "--help":
				process.stdout.write( `Usage: lazy-http [OPTION]... [PATH]...\n` );
				process.stdout.write( `OPTION:\n` );
				process.stdout.write( `    -h, --help Show this instruction\n` );
				process.stdout.write( `    -H, --host [host] Set bind address\n` );
				process.stdout.write( `    -p, --port [port] Set listen port\n` );
				process.stdout.write( `    -u, --unix [path] Listen to unix socket. ( Note that the -u option will suppress listening on ip & port! )\n` );
				process.stdout.write( `    -d, --document_root [path] Set document root. Default value is current working directory!\n` );
				process.stdout.write( `    -r, --rule [RULE_URI] Add and apply the rule uri!\n` );
				process.stdout.write( `        --config [path] Path to the server configuration file\n` );
				process.stdout.write( `        --proxy-only To start the proxy server without the basic static file serving mechanism\n` );
				process.stdout.write( `\nRULE_URI:\n` );
				process.stdout.write( `    proxy:[hostname][/sub_path/]::[dst-host]:[dst-port] Proxy request for hostname to remote http server!\n` );
				process.stdout.write( `    proxy:[hostname][/sub_path/]:http:[dst-host]:[dst-port] Proxy request for hostname to remote http server!\n` );
				process.stdout.write( `    proxy:[hostname][/sub_path/]:https:[dst-host]:[dst-port] Proxy request for hostname to remote https server!\n` );
				process.stdout.write( `    proxy:[hostname][/sub_path/]:unix:[dst-host]:[dst-port] Proxy request for hostname to local named pipe server!\n` );
				process.stdout.write( `    mime:[extension]:[mime-type] Add a relation between specified extension and mime-type!\n` );
				process.stdout.write( `    cors:[hostname]:[path-to-cors-handler] Attach a cors handler to a specific hostname!\n` );
				process.stdout.write( `    csp:[hostname]:[path-to-csp-handler] Attach a csp handler to a specific hostname!\n` );
				process.stdout.write( `PATH:\n` );
				process.stdout.write( `    This program will use the following rules to process the input paths.\n` );
				process.stdout.write( `        1. If the path is pointed to a valid file, then the path will be loaded as a config\n` );
				process.stdout.write( `        2. If the path is pointed to a valid directory, then the path will be used as the document root\n` );
				process.stdout.write( `        3. If the path doesn't exist, then verbose error message and skipping\n` );
				process.exit(0);
				break;
			
			case "-u":
			case "--unix":
				INPUT_CONF.unix = ARGV.shift();
				break;
			
			case "-H":
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
				INPUT_CONF.rules.push({
					rule:ARGV.shift().trim(),
					base_dir: WORKING_DIR
				});
				break;
				
			case "--echo":
				INPUT_CONF.echo_server = true;
				break;
			
			case "--proxy-only":
				INPUT_CONF.proxy_only = true;
				break;
			
			case "-c":
			case "--config":
			case "--conf":
			{
				const config_path = path.resolve( WORKING_DIR, ARGV.shift().trim() );
				try {
					await __LOAD_CONFIG(config_path);
				}
				catch(e) {
					process.stderr.write( `Cannot load target configuration file! (${config_path}) Skipping with error (${e.message})\n` );
				}
				break;
			}
			
			default:
				// NOTE: Load and detect path type
				const input_path = path.resolve( WORKING_DIR, option );
				let file_state;
				try {
					file_state = fs.statSync(input_path);
				}
				catch(e) {
					process.stderr.write( `Given path is invalid! (${input_path}) Skipping...\n` );
				}
				
				
				
				// NOTE: Do the corresponding behaviors
				if ( file_state.isDirectory() ) {
					INPUT_CONF.document_root = input_path;
				}
				else {
					try {
						await __LOAD_CONFIG(input_path);
					}
					catch(e) {
						process.stderr.write( `Cannot load target configuration file! (${input_path}) Skipping with error (${e.message})\n` );
					}
				}
				break;
		}
	}
	// endregion
	
	// region [ Process the configurations read from incoming arguments ]
	INPUT_CONF._proxy_only = !!INPUT_CONF.proxy_only;
	INPUT_CONF._echo_server = !!INPUT_CONF.echo_server;
	
	
	
	// NOTE: Processing rules
	for( const {rule, base_dir} of INPUT_CONF.rules ) {
		const scheme_pos = rule.indexOf(':');
		const scheme = (scheme_pos >= 0) ? rule.substring(0, scheme_pos) : null;
		
		if ( scheme === "proxy" ) {
			const matches = rule.match(PROXY_RULE);
			if ( !matches ) {
				process.stderr.write( `Invalid rule format detected! (${rule}) Skipping...` );
				continue;
			}
			
			let proxy_conf = Object.create(null),
				[, set_as_default, hostname, sub_path, dst_scheme="http", dst] = matches;
			
			hostname = hostname.trim();
			sub_path = sub_path ? sub_path.trim() : '/';
			
			
			if ( dst_scheme === "https" || dst_scheme === "http" ) {
				const matches = dst.match(HOST_PORT_FORMAT);
				if ( !matches ) {
					process.stderr.write( `Invalid hostname and port detected! Skipping... (${rule})` );
					continue;
				}
				
				const [, host, port] = matches;
				Object.assign(proxy_conf, {
					rule,
					src_host: hostname,
					src_path: sub_path,
					scheme: dst_scheme,
					dst_host: host,
					dst_port: port
				});
			}
			else {
				Object.assign(proxy_conf, {
					rule,
					src_host: hostname,
					src_path: sub_path,
					scheme: dst_scheme,
					dst_path: path.resolve(base_dir, dst)
				});
			}
			
			INPUT_CONF._proxy[hostname] = INPUT_CONF._proxy[hostname] || Object.create(null);
			INPUT_CONF._proxy[hostname][sub_path] = proxy_conf;
			INPUT_CONF._proxy_default = set_as_default ? hostname : null;
		}
		else if ( scheme === "mime" ) {
			const matches = rule.match(MIME_RULE);
			if ( !matches ) {
				process.stderr.write( `Invalid rule format detected! (${rule}) Skipping...` );
				continue;
			}
			
			const [,, ext, mime] = matches;
			INPUT_CONF._mime[ext] = mime;
		}
		else if ( scheme === "cors" ) {
			const matches = rule.match(CORS_RULE);
			if ( !matches ) {
				process.stderr.write( `Invalid rule format detected! (${rule}) Skipping...` );
				continue;
			}
			
			const [,, hostname, _handler_path] = matches;
			const handler_path = path.resolve(base_dir, _handler_path);
			try {
				let cors_processor = null;
				
				const cors_handler = require(handler_path);
				cors_processor = ( typeof cors_handler === "function" ) ? cors_handler : await GenerateMatchProcessor(cors_handler);
				
				if ( !cors_processor ) { throw new Error( "Target rule's handler contains invalid info!" ); }
				
				INPUT_CONF._cors[hostname] = cors_processor;
				cors_processor.handler_path = handler_path;
			} catch(e) {
				process.stderr.write( `Cannot process target rule! (${rule}) Skipping with error: (${e.message})\n` );
			}
		}
		else if (scheme === "csp") {
			const matches = rule.match(CSP_RULE);
			if ( !matches ) {
				process.stderr.write( `Invalid rule format detected! (${rule}) Skipping...` );
				continue;
			}
			
			const [,, hostname, _handler_path] = matches;
			const handler_path = path.resolve(base_dir, _handler_path);
			try {
				let csp_processor = null;
				
				const csp_handler = require(handler_path);
				csp_processor = ( typeof csp_handler === "function" ) ? csp_handler : await GenerateMatchProcessor(csp_handler);
				
				if ( !csp_processor ) { throw new Error( "Target rule's handler contains invalid info!" ); }
				
				INPUT_CONF._csp[hostname] = csp_processor;
				csp_processor.handler_path = handler_path;
			} catch(e) {
				process.stderr.write( `Cannot process target rule! (${rule}) Skipping with error: (${e.message})\n` );
			}
		}
	}
	// endregion
	
	
	
	
	
	
	const DOCUMENT_ROOT = path.resolve( WORKING_DIR, INPUT_CONF.document_root||'' );
	const EXT_MIME_MAP	= Object.assign( require('./kernel/mime-map.js'), INPUT_CONF._mime );
	const PROXY_ONLY	= INPUT_CONF._proxy_only;
	const ECHO_SERVER	= INPUT_CONF.echo_server;
	const BOUND_INFO	= [];
	const HTTP_SERVER	= http.createServer();
	
	// NOTE: Prepare incoming connection info
	if ( INPUT_CONF.unix ) {
		BOUND_INFO.push(INPUT_CONF.unix);
	}
	else {
		BOUND_INFO.push(INPUT_CONF.port, INPUT_CONF.host);
	}
	
	BOUND_INFO.push(()=>{
		const bind_info = HTTP_SERVER.address();
		const info_text = typeof bind_info === "string" ? bind_info : `${bind_info.address}:${bind_info.port}`;
		process.stdout.write( `\u001b[36mHost Server ( ${info_text} )\u001b[39m\n` );
		if ( PROXY_ONLY ) {
			process.stdout.write( `    \u001b[92mProxy Only\u001b[39m\n` );
		}
		else
		if ( ECHO_SERVER ) {
			process.stdout.write( `    \u001b[92mEcho Server\u001b[39m\n` );
		}
		else {
			process.stdout.write( `    \u001b[92mFile Server\u001b[39m\n` );
			process.stdout.write( `        \u001b[95mRoot: ${DOCUMENT_ROOT}\u001b[39m\n` );
			
			for( const ext in INPUT_CONF._mime ) {
				process.stdout.write( `        \u001b[95mMIME: ${ext} => ${INPUT_CONF._mime[ext]}\u001b[39m\n` );
			}
		}
		
		const proxy_hosts = Object.keys(INPUT_CONF._proxy);
		if ( proxy_hosts.length > 0 ) {
			process.stdout.write( `    \u001b[92mProxy Server\u001b[39m\n` );
			for( const host of proxy_hosts ) {
				const proxy_handlers = INPUT_CONF._proxy[host];
				const is_default = host === INPUT_CONF._proxy_default;
				
				
				process.stdout.write( `        \u001b[93m[${is_default?'DEFAULT ' : ''}${host}]\u001b[39m\n` );
				for ( const proxy_info of Object.values(proxy_handlers) ) {
					if ( proxy_info.scheme === "http" || proxy_info.scheme === "https" ) {
						process.stdout.write( `            \u001b[95mDEST: ${proxy_info.src_path} => ${proxy_info.scheme}://${proxy_info.dst_host}:${proxy_info.dst_port}\u001b[39m\n` );
					}
					else {
						process.stdout.write( `            \u001b[95mDEST: ${proxy_info.src_path} => ${proxy_info.scheme}://${proxy_info.dst_path}\u001b[39m\n` );
					}
				}
				
				const csp = INPUT_CONF._csp[host];
				if ( csp ) {
					process.stdout.write( `            \u001b[95mCSP:  ${csp.handler_path}\u001b[39m\n` );
				}
				
				const cors = INPUT_CONF._cors[host];
				if ( cors ) {
					process.stdout.write( `            \u001b[95mCORS: ${cors.handler_path}\u001b[39m\n` );
				}
			}
		}
	});
	
	HTTP_SERVER.on('request', (req, res)=>{
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
		const PickedProxyHandler = INPUT_CONF._proxy[HOST] || INPUT_CONF._proxy[INPUT_CONF._proxy_default];
		if ( PickedProxyHandler ) {
			const req_path = req.url_info.path;
			const handlers = PickedProxyHandler;
			
			
			let handler = null;
			for(const path in handlers ) {
				const proxy = handlers[path];
				if ( handler && (proxy.src_path.length < handler.length) ) continue;
				if ( req_path.substring(0, proxy.src_path.length) !== proxy.src_path ) continue;
				handler = proxy;
			}
			
			
			if ( handler ) {
				return http_proxy(handler, HOST, INPUT_CONF, req, res)
				.finally(()=>{
					if ( !res.finished ) {
						res.end();
					}
				});
			}
			else {
				Drain(req)
				.then(()=>{
					const now = (new Date()).toISOString();
					const source = req.socket;
					const source_info = (typeof SERVER_INFO === "string") ? SERVER_INFO : `${source.remoteAddress}:${source.remotePort}`;
					process.stderr.write(`\u001b[91m[${now}] 502 ${source_info} Host:${req.headers.host}\u001b[39m\n`);
					
					res.writeHead( 502, { "Content-Type": "text/plain" } );
					res.end( 'Unregistered proxy path!' );
				})
				.catch((e)=>{
					const now = (new Date()).toISOString();
					const source = req.socket;
					const source_info = (typeof SERVER_INFO === "string") ? SERVER_INFO : `${source.remoteAddress}:${source.remotePort}`;
					process.stderr.write(`\u001b[91m[${now}] 500 ${source_info} Unknown error\u001b[39m\n`);
					res.writeHead( 500, { "Content-Type": "text/plain" } );
					res.end( e.message );
				});
			}
		}
		// endregion
		
		
		
		const SERVER_INFO = req.socket.server.address();
		if ( PROXY_ONLY ) {
			Drain(req)
			.then(()=>{
				const now = (new Date()).toISOString();
				const source = req.socket;
				const source_info = (typeof SERVER_INFO === "string") ? SERVER_INFO : `${source.remoteAddress}:${source.remotePort}`;
				process.stderr.write(`\u001b[91m[${now}] 502 ${source_info} Host:${req.headers.host}\u001b[39m\n`);
				
				res.writeHead( 502, { "Content-Type": "text/plain" } );
				res.end( 'Unsupported destination!' );
			})
			.catch((e)=>{
				const now = (new Date()).toISOString();
				const source = req.socket;
				const source_info = (typeof SERVER_INFO === "string") ? SERVER_INFO : `${source.remoteAddress}:${source.remotePort}`;
				process.stderr.write(`\u001b[91m[${now}] 500 ${source_info} Unknown error\u001b[39m\n`);
				res.writeHead( 500, { "Content-Type": "text/plain" } );
				res.end( e.message );
			});
			return;
		}
		
		
		if ( ECHO_SERVER ) {
			ParseContent(req)
			.then((body_info)=>{
				const is_unix = typeof SERVER_INFO === "string";
				
				const headers = {};
				for(const header in req.headers) {
					const norm_header = header.replace(CAMEL_CASE_PATTERN, CAMEL_REPLACER);
					headers[norm_header] = req.headers[header];
				}
				
				res.writeHead( 200, { "Content-Type": "application/json" } );
				res.end(JSON.stringify({
					source: is_unix ? SERVER_INFO : {
						address:res.socket.remoteAddress,
						port:res.socket.remotePort,
						family:res.socket.remoteFamily
					},
					method: req.method,
					headers: headers,
					payload: body_info,
					timestamp: Math.floor(Date.now()/1000),
					timestamp_milli: Date.now()
				}));
				
				const now = (new Date()).toISOString();
				const source = req.socket;
				const source_info = (typeof SERVER_INFO === "string") ? SERVER_INFO : `${source.remoteAddress}:${source.remotePort}`;
				process.stdout.write(`\u001b[90m[${now}] 200 ${source_info} ${req.url}\u001b[39m\n`);
			})
			.catch((e)=>{
				res.writeHead( 500, { "Content-Type": "text/plain" } );
				res.end( e.message );
			});
			return;
		}
		
		// region [ Act as a default file server ]
		__ON_DEFAULT_HOST_REQUESTED(req, res)
		.then(()=>{
			const now = (new Date()).toISOString();
			const source = req.socket;
			const source_info = (typeof SERVER_INFO === "string") ? SERVER_INFO : `${source.remoteAddress}:${source.remotePort}`;
			process.stdout.write(`\u001b[90m[${now}] 200 ${source_info} ${req.url}\u001b[39m\n`);
		})
		.catch((e)=>{
			const now = (new Date()).toISOString();
			const source = req.socket;
			const source_info = (typeof SERVER_INFO === "string") ? SERVER_INFO : `${source.remoteAddress}:${source.remotePort}`;
			const err = (e === 403 ? 403 : ( e === 404 ? 404 : 500 ));
			process.stderr.write(`\u001b[91m[${now}] ${err} ${source_info} ${req.url}\u001b[39m\n`);
		})
		.finally(()=>{
			if ( !res.finished ) {
				res.end();
			}
		});
		// endregion
	});
	HTTP_SERVER.listen(...BOUND_INFO);
	
	
	
	
	
	
	async function __LOAD_CONFIG(config_path) {
		const config_dir  = path.dirname(config_path);
		const period_pos = config_path.lastIndexOf( '.' );
		const extension = (period_pos >= 0) ? config_path.substring(period_pos) : '';
		if ( extension !== ".json" && extension !== ".js" ) {
			process.stderr.write( "Server configuration file must be a json file or a js file! Skipping...\n" );
			return;
		}
		
		const config = require( config_path );
		if ( Object(config) !== config ) {
			process.stderr.write( "Server configuration file must be started with an object! Skipping...\n" );
			return;
		}
		
		
		
		if ( config['host'] !== undefined ) {
			INPUT_CONF['host'] = config['host'];
		}
		if ( config['port'] !== undefined ) {
			INPUT_CONF['port'] = config['port'];
		}
		if ( config['unix'] !== undefined ) {
			INPUT_CONF['unix'] = path.resolve(config_dir, config['unix']);
		}
		if ( typeof config['document_root'] === "string" ) {
			INPUT_CONF['document_root'] = path.resolve(config_dir, config['document_root']);
		}
		if ( config['ssl_check'] !== undefined ) {
			INPUT_CONF['ssl_check'] = !!config['ssl_check'];
		}
		if ( config['proxy_only'] !== undefined ) {
			INPUT_CONF['proxy_only'] = !!config['proxy_only'];
		}
		if ( Array.isArray(config['rules']) ) {
			const rules = [];
			for(const rule of config['rules']) {
				rules.push({
					rule,
					base_dir:config_dir
				});
			}
			INPUT_CONF['rules'] = rules;
		}
	}
	async function __ON_DEFAULT_HOST_REQUESTED(req, res) {
		let targetURL = __GET_REQUEST_PATH(req.url);
		
		
		// NOTE: This only prevents conditions such as "?a=1&b=2#hash"
		// NOTE: Theoretically, this condition will not occur
		// NOTE: NodeJS and Browser will automatically add / in the beginning
		if ( targetURL[0] !== "/" ) { targetURL = `/${targetURL}`; }
		
		// NOTE: If the path is a directory ( ended with a forward slash )
		if ( targetURL.substr(-1) === '/' ) { targetURL += 'index.html'; }
		
		// NOTE: Resolve path to absolute path ( Purge relative paths such as .. and . )
		// NOTE: This prevents unexpected /../a/b/c condition which will access out of document root
		// NOTE: Theoretically, this condition will also not occur in most cases
		// NOTE: Browsers and CURL will not allow this to happen...
		targetURL = __PURGE_RELATIVE_PATH(targetURL);
		
		
		// NOTE: Make the url be a full path from document root
		targetURL = `${DOCUMENT_ROOT}${targetURL}`;
		
		
		
		
		
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
	function __PURGE_RELATIVE_PATH(path) {
		const path_comp = path.substring(1).split('/');
		const new_path = [];
		for( const comp of path_comp ) {
			if ( comp === "." ) continue;
			if ( comp === ".." ) {
				new_path.splice(new_path.length-1, 1);
				continue;
			}
			new_path.push(comp);
		}
		
		return `/${new_path.join('/')}`;
	}
})().catch((e)=>{throw e;});
