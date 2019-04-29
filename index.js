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
	const http_proxy = require( './http-proxy.js' );
	
	const HOST_PROXY_FORMAT_CHECK = /^([a-zA-Z0-9\-_.]+)::([a-zA-Z0-9\-_.]+):([0-9]+)$/;
	
	// region [ Process incoming arguments ]
	const CONFIGURABLE_FIELDS = [
		'host',
		'port',
		'unix',
		'document_root',
		'mime_map',
		'proxy_map'
	];
	const INPUT_CONF = Object.assign(Object.create(null), {
		host:'localhost',
		port:80,
		unix:null,
		document_root: process.cwd(),
		mime_map: null,
		proxy_map: [],
		
		_proxy_map: Object.create(null),
		_connection: [],
		_mime: Object.create(null),
		_paths: Object.create(null)
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
				process.stderr.write( `        --mime-map [path] Path to the extended mime map\n` );
				process.stderr.write( `        --path-map [path] Path to the extended path map\n` );
				process.stderr.write( `        --host-proxy [source-host::dest-host:dest-port] The http request will be proxied to the corresponding destination\n` );
				process.stderr.write( `        --config [path] Path to the server configuration file\n` );
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
			
			case "--mime-map":
				INPUT_CONF.mime_map = ARGV.shift();
				break;
				
			case "--host-proxy":
			{
				const proxy_info = ARGV.shift();
				INPUT_CONF.proxy_map.push(proxy_info);
				break;
			}
			
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
	
	// NOTE: Prepare connection info
	if ( INPUT_CONF.unix ) {
		INPUT_CONF._connection.push(INPUT_CONF.unix);
	}
	else {
		INPUT_CONF._connection.push(INPUT_CONF.port, INPUT_CONF.host);
	}
	
	// NOTE: Load extended mime map
	if ( INPUT_CONF.mime_map ) {
		try {
			INPUT_CONF._mime = require(path.resolve(process.cwd(), INPUT_CONF.mime_map));
			if ( Object(INPUT_CONF._paths) !== INPUT_CONF._paths ) {
				throw new Error("");
			}
		}
		catch(e) {
			process.stdout.write( `\u001b[91mCannot load extended mime map ${INPUT_CONF.mime_map}\n` );
			process.exit(1);
		}
	}
	
	// NOTE: Process proxy map
	for(const proxy_info of INPUT_CONF.proxy_map) {
		const matches = proxy_info.match(HOST_PROXY_FORMAT_CHECK);
		if ( !matches ) {
			process.stderr.write( "Invalid format for --host-proxy option! src-host::dst-host:dst-port is required!" );
			process.exit(1);
		}
		
		const src_host = matches[1].trim();
		INPUT_CONF._proxy_map[src_host] = {
			src_host: src_host,
			dst_host: matches[2].trim(),
			dst_port: matches[3].trim()
		};
	}
	// endregion
	
	
	
	
	
	
	const DOCUMENT_ROOT = path.resolve( process.cwd(), INPUT_CONF.document_root || '');
	const SUB_PACKAGE_MAP = Object.assign({}, INPUT_CONF._paths);
	const EXT_MIME_MAP = Object.assign(require('./mime-map.js'), INPUT_CONF._mime);
	
	
	
	http.createServer((req, res)=>{
		let _req_host = `${req.headers.host}`.trim();
		let _div_pos  = _req_host.indexOf( ':' );
		_req_host = ( _div_pos >= 0 ) ? _req_host.substring(0, _div_pos).trim() : _req_host;
		_req_host = ( _req_host === "" ) ? undefined : _req_host;
		
		if ( _req_host !== undefined && INPUT_CONF._proxy_map[_req_host] !== undefined ) {
			return http_proxy(INPUT_CONF._proxy_map[_req_host], req, res)
			.finally(()=>{
				if ( !res.finished ) {
					res.end();
				}
			});
		}
	
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
	}).listen(...INPUT_CONF._connection);
	
	
	
	
	
	
	async function __ON_DEFAULT_HOST_REQUESTED(req, res) {
		const REQUEST_URL = __GET_REQUEST_PATH(req.url);
		
		
		let targetURL = null;
		const ITEM = REQUEST_URL.substring(0, REQUEST_URL.indexOf('/', 1)).toLowerCase();
		for ( const map in SUB_PACKAGE_MAP ) {
			if ( map !== ITEM ) continue;
			
			const MAP_PATH = SUB_PACKAGE_MAP[map];
			const REMAINING = REQUEST_URL.substring(map.length);
			if ( typeof MAP_PATH !== "function" ) {
				targetURL = `${MAP_PATH}${REMAINING}`;
				break;
			}
			
			targetURL = await MAP_PATH(req, res, REMAINING);
		}
		
		
		
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
