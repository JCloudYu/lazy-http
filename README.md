# LazyHttp Server #
This module is aimed to provide a http server that can only serve static contents. This is for developers who want to test their site without needs to install and establish heavy server that is used only for simple web testing.

## Friendly Reminder ##
Well, since that this module's purpose is very simple, "Provide simple and light-weighted http server for developers who only wants to test their website logic via valid http environment", this module has following features...

- <span style='color:green'>This module dones't have any external dependency but the nodejs's built-in modules</span>
- <span style='color:red'>This module is NOT designed to be used as a module</span>
- <span style='color:red'>This module is NOT designed to serving large files</span>

## How to use ? ##
All you need to do is to install the package globally using following command.
```bash
npm install -g lazy-http
```

And use `lazy-http` command to instantiate a server. Following lines are the verbose output of the `lazy-http --help` command.
```text
Usage: lazy-http [OPTION]... [PATH]...
OPTION:
    -h, --help Show this instruction
    -H, --host [host] Set bind address
    -p, --port [port] Set listen port
    -u, --unix [path] Listen to unix socket. ( Note that the -u option will suppress listening on ip & port! )
    -d, --document_root [path] Set document root. Default value is current working directory!
    -r, --rule [RULE_URI] Add and apply the rule uri!
        --config [path] Path to the server configuration file

RULE_URI:
    proxy:[hostname]::[dst-host]:[dst-port] Proxy request for hostname to remote http server!
    proxy:[hostname]:http:[dst-host]:[dst-port] Proxy request for hostname to remote http server!
    proxy:[hostname]:https:[dst-host]:[dst-port] Proxy request for hostname to remote https server!
    proxy:[hostname]:unix:[dst-host]:[dst-port] Proxy request for hostname to local named pipe server!
    mime:[extension]:[mime-type] Add a relation between specified extension and mime-type!
    cors:[hostname]:[path-to-cors-handler] Attach a cors handler to a specific hostname!
    csp:[hostname]:[path-to-csp-handler] Attach a csp handler to a specific hostname!
PATH:
    This program will use the following rules to process the input paths.
        1. If the path is pointed to a valid file, then the path will be loaded as a config
        2. If the path is pointed to a valid directory, then the path will be used as the document root
        3. If the path doesn't exist, then verbose error message and skipping
```

## Logs ##
This tool will generate verbose output in stdout and stderr. The stdout lists succeeded queries and stderr lists failed queries. The following line shows an example line of output, which contains time presented in ISO format, responded http status code, remote ip, remote port and requested URI.

```text
[2019-01-12T05:16:52.157Z] 200 127.0.0.1:60977 /
```

Note that each output will contains leading and tailing terminal color controlling sequences! It is compatible to ANSI/VT100 Spec. So, some of the environment cannot read it normally! If you encounter a problem reading it, you should write a program to purge the sequences to get normal output!


## Debugging ##
Well, since this module executable itself is a javascript module. You can easily using following command to enable nodejs inspection to debug the server...

```bash
node --inspect $(which lazy-http)
```

## DEFAULT-MIME-MAP ##
The lazy-http server by default will act as a normal static http file server, which will respond mime types according to the extensions of the requested files. Please refer to [Default MIME Types](./docs/default-mime-types.md) for the complete list of the supported extension and their corresponding mime types!

## Features in the far far future... ##
Since that this module is designed for testing purpose, following requirement of "testing environments" are planned to be delivered in the future ( when I have time or someone is willing to helpout... )

- Support http/2, http/3 logic
