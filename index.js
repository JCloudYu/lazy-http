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
	
	// region [ Process incoming arguments ]
	const INPUT_CONF = {
		host:'localhost',
		port:80,
		unix:null,
		document_root: process.cwd(),
		mime_map: null,
		path_map: null,
		
		_connection: [],
		_mime:{},
		_paths:{}
	};
	let ARGV = process.argv;
	while ( ARGV.length > 0 ) {
		const option = ARGV.shift();
		switch(option) {
			case "--help":
				process.stderr.write( `Usage: lazy-http [OPTIONS]\n` );
				process.stderr.write( `OPTIONS:\n` );
				process.stderr.write( `    --help Show this instruction\n` );
				process.stderr.write( `    -h, --host [host] Set bind address\n` );
				process.stderr.write( `    -p, --port [port] Set listen port\n` );
				process.stderr.write( `    -u, --unix [path] Listen to unix socket. ( Note that the -u option will suppress listening on ip & port! )\n` );
				process.stderr.write( `    -d, --document_root [path] Set document root. Default value is current working directory!\n` );
				process.stderr.write( `        --mime-map [path] Path to the extended mime map\n` );
				process.stderr.write( `        --path-map [path] Path to the extended path map\n` );
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
				
			case "--path-map":
				INPUT_CONF.path_map = ARGV.shift();
				break;
			
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
	
	// NOTE: Load extended path map
	if ( INPUT_CONF.path_map ) {
		try {
			INPUT_CONF._paths = require(path.resolve(process.cwd(), INPUT_CONF.path_map));
			if ( Object(INPUT_CONF._paths) !== INPUT_CONF._paths ) {
				throw new Error("");
			}
		}
		catch(e) {
			process.stdout.write( `\u001b[91mCannot load extended mime map ${INPUT_CONF.path_map}\n` );
			process.exit(1);
		}
	}
	// endregion
	
	
	
	
	
	
	const DOCUMENT_ROOT = INPUT_CONF.document_root;
	const SUB_PACKAGE_MAP = Object.assign({}, INPUT_CONF._paths);
	const EXT_MIME_MAP = Object.assign(require('./mime-map.js'), INPUT_CONF._mime);
	
	
	
	http.createServer((req, res)=>{
		__ON_REQUESTED(req, res)
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
	
	
	
	
	
	
	async function __ON_REQUESTED(req, res) {
		const REQUEST_URL = req.url;
		
		
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
})().catch((e)=>{throw e;});
