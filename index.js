#!/usr/bin/env node
/**
 *	Author: JCloudYu
 *	Create: 2019/01/12
**/
(async()=>{
	"use strict";
	
	const http  = require( 'http' );
	const https = require( 'https' );
	const path  = require( 'path' );
	const fs    = require('fs');
	
	const {ParseURLPath, GenerateMatchProcessor, Drain, ParseContent} = require( './kernel/helper.js' );
	const show_help  = require( './show-help.js' );
	const http_proxy = require( './kernel/http-proxy.js' );
	
	const PROXY_RULE = /^proxy(:default)?:([a-zA-Z0-9\-_.]+)(\/|\/[^ ]+\/)?:(http|https|pipe)?:(.+)$/;
	const MIME_RULE	 = /^mime(:default)?:(.+):(.+\/.+)$/;
	const CORS_RULE	 = /^cors(:default)?:([a-zA-Z0-9\-_.]+):(.+)$/;
	const CSP_RULE	 = /^csp(:default)?:([a-zA-Z0-9\-_.]+):(.+)$/;
	const HOST_PORT_FORMAT = /^([a-zA-Z0-9\-_.]+):([0-9]+)$/;
	const PORT_FORMAT = /^([0-9]+)$/;
	const CAMEL_CASE_PATTERN = /(\w)(\w*)(\W*)/g;
	const CAMEL_REPLACER = (match, $1, $2, $3, index, input )=>{
		return `${$1.toUpperCase()}${$2.toLowerCase()}${$3}`;
	};
	
	// region [ Process incoming arguments ]
	const WORKING_DIR = process.cwd();
	const SCRIPT_ROOT = path.dirname(process.argv[1]);
	const INPUT_CONF = Object.assign(Object.create(null), {
		host:'localhost',
		port: '',
		ssl: false,
		ssl_cert: '',
		ssl_key: '',
		ssl_key_pass: '',
		unix:null,
		ssl_check:true,
		document_root:WORKING_DIR,
		rules: [],
		proxy_only:false,
		invisible:false,
		force_local:false,
		echo_server:false
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
				show_help(process.stdout);
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
			case "--ssl":
				INPUT_CONF.ssl = true;
				break;
			case "--ssl-cert":
				INPUT_CONF.ssl = true;
				INPUT_CONF.ssl_cert = ARGV.shift();
				break;
			case "--ssl-key":
				INPUT_CONF.ssl = true;
				INPUT_CONF.ssl_key = ARGV.shift();
				break;
			case "--ssl-key-pass":
				INPUT_CONF.ssl_key_pass = ARGV.shift();
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
			case "--invisible":
				INPUT_CONF.invisible = true;
				break;
			case "--force-local":
				INPUT_CONF.force_local = true;
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
				}
				catch(e) {
					process.stderr.write( `Given path is invalid! (${input_path}) Skipping...\n` );
				}
				break;
		}
	}
	// endregion
	
	// region [ Process the configurations read from incoming arguments ]
	const SANITIZED_CONF = {
		_ssl: false,
		_ssl_info: null,
		_echo_server: false,
		_port: null,
		_proxy_only: false,
		_invisible: false,
		_force_local: false,
		_proxy:Object.create(null),
		_proxy_default:null,
		_mime:Object.create(null),
		_cors:Object.create(null),
		_csp:Object.create(null),
		_connection:[],
	};
	SANITIZED_CONF._invisible = !!INPUT_CONF.invisible;
	SANITIZED_CONF._force_local = !!INPUT_CONF.force_local;
	SANITIZED_CONF._proxy_only = !!INPUT_CONF.proxy_only;
	SANITIZED_CONF._ssl_check = !!INPUT_CONF.ssl_check;
	SANITIZED_CONF._echo_server = !!INPUT_CONF.echo_server;
	SANITIZED_CONF._ssl = !!INPUT_CONF.ssl;
	SANITIZED_CONF._port = PORT_FORMAT.test(INPUT_CONF.port) ? INPUT_CONF.port : (SANITIZED_CONF._ssl?443:80);
	
	
	
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
			
			SANITIZED_CONF._proxy[hostname] = SANITIZED_CONF._proxy[hostname] || Object.create(null);
			SANITIZED_CONF._proxy[hostname][sub_path] = proxy_conf;
			if ( set_as_default ) {
				SANITIZED_CONF._proxy_default = hostname;
			}
		}
		else if ( scheme === "mime" ) {
			const matches = rule.match(MIME_RULE);
			if ( !matches ) {
				process.stderr.write( `Invalid rule format detected! (${rule}) Skipping...` );
				continue;
			}
			
			const [,, ext, mime] = matches;
			SANITIZED_CONF._mime[ext] = mime;
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
				
				SANITIZED_CONF._cors[hostname] = cors_processor;
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
				
				SANITIZED_CONF._csp[hostname] = csp_processor;
				csp_processor.handler_path = handler_path;
			} catch(e) {
				process.stderr.write( `Cannot process target rule! (${rule}) Skipping with error: (${e.message})\n` );
			}
		}
	}
	// endregion
	
	// region [ Process SSL information ]
	{
		if ( SANITIZED_CONF._ssl ) {
			const cert_path	= (INPUT_CONF.ssl_cert||'').trim();
			const key_path	= (INPUT_CONF.ssl_key||'').trim();
			const key_pass	= (INPUT_CONF.ssl_key_pass||'').trim();
			const ssl_info_provided=cert_path && key_path;
			
			SANITIZED_CONF._ssl_info = !ssl_info_provided ? null : {
				cert:cert_path,
				key:key_path,
				key_pass:key_pass
			};
		}
	}
	// endregion
	
	
	
	
	const DOCUMENT_ROOT = path.resolve(WORKING_DIR, INPUT_CONF.document_root||'');
	const EXT_MIME_MAP	= Object.assign(require('./kernel/mime-map.js'), SANITIZED_CONF._mime);
	const RUNTIME_CONF	= Object.assign({}, INPUT_CONF, SANITIZED_CONF);
	const {
		_proxy_only:PROXY_ONLY,
		_echo_server:ECHO_SERVER,
		_ssl:USE_SSL,
		_ssl_info: SSL_INFO,
		_port: HOST_PORT,
		_invisible: INVISIBLE_PROXY,
		_force_local: VERBOSE_LOCAL_INFO
	} = RUNTIME_CONF;
	
	
	
	const BOUND_INFO	= [];
	let HTTP_SERVER		= null;
	
	// NOTE: Prepare incoming connection info
	if ( INPUT_CONF.unix ) {
		BOUND_INFO.push(INPUT_CONF.unix);
	}
	else {
		BOUND_INFO.push(HOST_PORT, INPUT_CONF.host);
	}
	
	if ( !USE_SSL ) {
		HTTP_SERVER = http.createServer();
	}
	else {
		const ssl_info = {};
		if ( !SSL_INFO ) {
			ssl_info.cert = fs.readFileSync(`${SCRIPT_ROOT}/defaults/ssl.crt`);
			ssl_info.key  = fs.readFileSync(`${SCRIPT_ROOT}/defaults/ssl.key`);
		}
		else {
			let {cert:cert_path, key:key_path, key_pass:cert_key_pass=''} = SSL_INFO;
			
			
			if ( !cert_path ) {
				process.stderr.write(`You must provide ssl certificate corresponding to the provided ssl certificate key!`);
				process.exit(1);
			}
			
			SSL_INFO.cert = cert_path = path.resolve(WORKING_DIR, cert_path);
			try {
				ssl_info.cert = fs.readFileSync(cert_path);
			}
			catch(e) {
				process.stderr.write(`Cannot read ssl certificate at \`${cert_path}\``);
				process.exit(1);
			}
			
			
			
			if ( !key_path ) {
				process.stderr.write(`You must provide ssl certificate key corresponding to the provided ssl certificate!`);
				process.exit(1);
			}
			
			SSL_INFO.key  = key_path = path.resolve(WORKING_DIR, key_path);
			try {
				ssl_info.key = [{
					pem: fs.readFileSync(key_path),
					passphrase: cert_key_pass||undefined
				}];
			}
			catch(e) {
				process.stderr.write(`Cannot read ssl key at \`${key_path}\``);
				process.exit(1);
			}
		}
	
		HTTP_SERVER = https.createServer(ssl_info);
	}
	
	
	
	BOUND_INFO.push(()=>{
		const bind_info = HTTP_SERVER.address();
		const info_text = typeof bind_info === "string" ? bind_info : `${bind_info.address}:${bind_info.port}`;
		
		if ( !USE_SSL ) {
			process.stdout.write( `\u001b[36mHosting Server on ${info_text}\u001b[39m\n` );
		}
		else {
			process.stdout.write( `\u001b[36mHosting SSL Server on ${info_text}\u001b[39m\n` );
			if ( !SSL_INFO ) {
				process.stdout.write( `    \u001b[92mBuilt-in self-signed certificate\u001b[39m\n` );
			}
			else {
				process.stdout.write( `    \u001b[92mCertificate\u001b[39m\n` );
				process.stdout.write( `        \u001b[95m${SSL_INFO.cert}\u001b[39m\n` );
				
				process.stdout.write( `    \u001b[92mCertificate Key\u001b[39m\n` );
				process.stdout.write( `        \u001b[95m${SSL_INFO.key}\u001b[39m\n` );
			}
		}
		
		if ( VERBOSE_LOCAL_INFO ) {
			process.stdout.write( `    \u001b[92mForce Local Info Verbose Enabled\u001b[39m\n` );
		}
		
		if ( PROXY_ONLY ) {
			process.stdout.write( `    \u001b[92mProxy Only\u001b[39m\n` );
		}
		else
		if ( ECHO_SERVER ) {
			process.stdout.write( `    \u001b[92mEcho Server\u001b[39m\n` );
		}
		else
		if ( !RUNTIME_CONF._proxy_default ) {
			process.stdout.write( `    \u001b[92mFile Server\u001b[39m\n` );
			process.stdout.write( `        \u001b[95mRoot: ${DOCUMENT_ROOT}\u001b[39m\n` );
			
			for( const ext in RUNTIME_CONF._mime ) {
				process.stdout.write( `        \u001b[95mMIME: ${ext} => ${RUNTIME_CONF._mime[ext]}\u001b[39m\n` );
			}
		}
		
		const proxy_hosts = Object.keys(RUNTIME_CONF._proxy);
		if ( proxy_hosts.length > 0 ) {
			process.stdout.write( `    \u001b[92mProxy Server${RUNTIME_CONF._invisible?' (Invisible Proxy)': ''}\u001b[39m\n` );
			for( const host of proxy_hosts ) {
				const proxy_handlers = RUNTIME_CONF._proxy[host];
				const is_default = host === RUNTIME_CONF._proxy_default;
				
				
				process.stdout.write( `        \u001b[93m[${is_default?'DEFAULT ' : ''}${host}]\u001b[39m\n` );
				for ( const proxy_info of Object.values(proxy_handlers) ) {
					if ( proxy_info.scheme === "http" || proxy_info.scheme === "https" ) {
						process.stdout.write( `            \u001b[95mDEST: ${proxy_info.src_path} => ${proxy_info.scheme}://${proxy_info.dst_host}:${proxy_info.dst_port}\u001b[39m\n` );
					}
					else {
						process.stdout.write( `            \u001b[95mDEST: ${proxy_info.src_path} => ${proxy_info.scheme}://${proxy_info.dst_path}\u001b[39m\n` );
					}
				}
				
				const csp = RUNTIME_CONF._csp[host];
				if ( csp ) {
					process.stdout.write( `            \u001b[95mCSP:  ${csp.handler_path}\u001b[39m\n` );
				}
				
				const cors = RUNTIME_CONF._cors[host];
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
		const INCOMING_SOCKET	= req.socket;
		const SERVER_INFO		= INCOMING_SOCKET.server.address();
		// endregion
		
		// region [ Parse requested url ]
		let _raw_url = req.url || '';
		if ( _raw_url[0] !== "/" ) _raw_url = `/${_raw_url}`;
		req.url_info = ParseURLPath(_raw_url);
		
		
		
		req.invisible_mode = INVISIBLE_PROXY;
		req.server_info = INCOMING_SOCKET.server.address();
		req.proxy_ip	= `${req.headers['x-real-ip']||''}`.trim();
		req.proxy_port	= `${req.headers['x-real-port']||''}`.trim();
		req.hw_remote_socket = (typeof req.server_info === "string") ? null : {
			family: INCOMING_SOCKET.remoteFamily,
			address: INCOMING_SOCKET.remoteAddress,
			port: INCOMING_SOCKET.remotePort,
		};
		
		
		
		if ( !VERBOSE_LOCAL_INFO && req.proxy_ip !== '' ) {
			req.source_info = req.proxy_ip + (req.proxy_port ? ':'+req.proxy_port : '');
		}
		
		if ( !req.source_info || VERBOSE_LOCAL_INFO ) {
			if ( !req.hw_remote_socket ) {
				req.source_info = req.server_info;
			}
			else {
				req.source_info = `${req.hw_remote_socket.address}:${req.hw_remote_socket.port}`;
			}
		}
		// endregion
		
		
		
		// region [ Do check hostname based proxy ]
		const PickedProxyHandler = RUNTIME_CONF._proxy[HOST] || RUNTIME_CONF._proxy[RUNTIME_CONF._proxy_default];
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
				return http_proxy(handler, HOST, RUNTIME_CONF, req, res)
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
					process.stderr.write(`\u001b[91m[${now}] 502 ${req.source_info} Host:${req.headers.host}${req.url}\u001b[39m\n`);
					
					res.writeHead( 502, { "Content-Type": "text/plain" } );
					res.end( 'Unregistered proxy path!' );
				})
				.catch((e)=>{
					const now = (new Date()).toISOString();
					process.stderr.write(`\u001b[91m[${now}] 500 ${req.source_info} Unknown error\u001b[39m\n`);
					res.writeHead( 500, { "Content-Type": "text/plain" } );
					res.end( e.message );
				});
			}
		}
		// endregion
		
		
		
		if ( PROXY_ONLY ) {
			Drain(req)
			.then(()=>{
				const now = (new Date()).toISOString();
				process.stderr.write(`\u001b[91m[${now}] 502 ${req.source_info} Host:${req.headers.host}${req.url}\u001b[39m\n`);
				
				res.writeHead( 502, { "Content-Type": "text/plain" } );
				res.end( 'Unregistered host!' );
			})
			.catch((e)=>{
				const now = (new Date()).toISOString();
				process.stderr.write(`\u001b[91m[${now}] 500 ${req.source_info} Unknown error\u001b[39m\n`);
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
				process.stdout.write(`\u001b[90m[${now}] 200 ${req.source_info} ${req.url}\u001b[39m\n`);
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
			process.stdout.write(`\u001b[90m[${now}] 200 ${req.source_info} ${req.url}\u001b[39m\n`);
		})
		.catch((e)=>{
			const now = (new Date()).toISOString();
			const err = (e === 403 ? 403 : ( e === 404 ? 404 : 500 ));
			process.stderr.write(`\u001b[91m[${now}] ${err} ${req.source_info} ${req.url}\u001b[39m\n`);
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
		
		
		const {host, port, unix, document_root:doc_root, rules:input_rules, ...input_conf} = config;
		if ( host !== undefined ) {
			INPUT_CONF['host'] = '' + host;
		}
		if ( port !== undefined && /^\d+$/.test(port) ) {
			INPUT_CONF['port'] = parseInt(port);
		}
		if ( unix !== undefined ) {
			INPUT_CONF['unix'] = path.resolve(config_dir, unix);
		}
		if ( typeof doc_root === "string" ) {
			INPUT_CONF['document_root'] = path.resolve(config_dir, doc_root);
		}
		
		if ( Array.isArray(input_rules) ) {
			const rules = [];
			for(const rule of input_rules) {
				rules.push({ rule, base_dir:config_dir });
			}
			INPUT_CONF['rules'] = rules;
		}
		
		
		
		Object.assign(INPUT_CONF, input_conf);
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
