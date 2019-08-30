/**
 *	Author: JCloudYu
 *	Create: 2019/08/15
**/
module.exports = function(stream){
	stream.write( `Usage: lazy-http [OPTION]... [PATH]...\n` );
	stream.write( `OPTION:\n` );
	stream.write( `    -v, --version Show the version of current lazy-http instance\n` );
	stream.write( `    -h, --help Show this instruction\n` );
	stream.write( `    -H, --host [host] Set bind address\n` );
	stream.write( `    -p, --port [port] Set listen port\n` );
	stream.write( `    -u, --unix [path] Start the server and make the server listen to unix socket\n` );
	stream.write( `    -d, --document_root [path] Set document root. Default value is current working directory!\n` );
	stream.write( `    -r, --rule [RULE_URI] Add and apply the rule uri!\n` );
	stream.write( `    -c, --config [path] Path to the server configuration file\n` );
	stream.write( `        --no-ssl-check The proxy server will not check the validity of remote server's ssl certificate\n` );
	stream.write( `        --proxy-only To start the proxy server without the basic static file serving mechanism\n` );
	stream.write( `        --force-local Make the server show only local socket information in verbose log\n` );
	stream.write( `        --invisible The server will not pass any proxy headers to remote servers\n` );
	stream.write( `        --echo Start the server as a simple echo server that will respond with the information related to the request\n` );
	stream.write( `        --ssl Start the server in ssl mode ( https )\n` );
	stream.write( `        --ssl-cert Start the server in ssl mode using the provided certificate\n` );
	stream.write( `        --ssl-key Start the server in ssl mode using the provided certificate key\n` );
	stream.write( `        --ssl-key-pass Start the server in ssl mode using the provided certificate key and corresponding passphrase\n` );
	stream.write( `\nRULE_URI:\n` );
	stream.write( `    proxy:[hostname][/sub_path/]::[dst-host]:[dst-port] Proxy request for hostname to remote http server!\n` );
	stream.write( `    proxy:[hostname][/sub_path/]:http:[dst-host]:[dst-port] Proxy request for hostname to remote http server!\n` );
	stream.write( `    proxy:[hostname][/sub_path/]:https:[dst-host]:[dst-port] Proxy request for hostname to remote https server!\n` );
	stream.write( `    proxy:[hostname][/sub_path/]:unix:[dst-host]:[dst-port] Proxy request for hostname to local named pipe server!\n` );
	stream.write( `    mime:[extension]:[mime-type] Add a relation between specified extension and mime-type!\n` );
	stream.write( `    cors:[hostname]:[path-to-cors-handler] Attach a cors handler to a specific hostname!\n` );
	stream.write( `    csp:[hostname]:[path-to-csp-handler] Attach a csp handler to a specific hostname!\n` );
	stream.write( `PATH:\n` );
	stream.write( `    This program will use the following rules to process the input paths.\n` );
	stream.write( `        1. If the path is pointed to a valid file, then the path will be loaded as a config\n` );
	stream.write( `        2. If the path is pointed to a valid directory, then the path will be used as the document root\n` );
	stream.write( `        3. If the path doesn't exist, then verbose error message and skipping\n` );
};
