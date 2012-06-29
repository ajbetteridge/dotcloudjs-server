var express = require('express');
var app = module.exports = express.createServer();

// Environment
var fs = require('fs');
try {
    var env = JSON.parse(fs.readFileSync('/home/dotcloud/environment.json'));
} catch (e) {
    env = process.env;
}

var CENTRALIZE = !env.DECENTRALIZE;

var io = require('stack.io')({
    transport: env.DOTCLOUD_STORE_REDIS_URL
});

// Express Configuration
app.configure(function(){
    app.use(express.bodyParser());
    app.use(express.methodOverride());
    app.use(express.cookieParser());
    app.use(express.session({ secret: "__session_secret__" }));
    app.use(app.router);
});

app.configure('development', function(){
    app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
});

app.configure('production', function(){
    app.use(express.errorHandler());
});


// Database configuration
var db, dbConfig = {
    host: env.DOTCLOUD_DB_MONGODB_HOST || 'localhost',
    port: parseInt(env.DOTCLOUD_DB_MONGODB_PORT) || 27017,
    user: env.DOTCLOUDJS_MONGO_USER || null,
    password: env.DOTCLOUDJS_MONGO_PWD || null,
    stackid: env.DOTCLOUDJS_STACKID || null
};

console.log(dbConfig);

db = require("./connectors/db")(app, dbConfig);

// Public modules instantiation
try {
    var publicModules = fs.readdirSync("./public/modules");
    for(var i=0; i<publicModules.length; i++) {
        if (publicModules[i].lastIndexOf('.js') === publicModules[i].length - 3)
            require("./public/modules/" + publicModules[i])(app, db, env);
    }    
} catch (e) {
    console.log('No public modules directory');
}

// dotcloud.js Modules instantiation
if (CENTRALIZE) {
    var submodules = fs.readdirSync('./modules');
    for (var i = 0; i < submodules.length; i++) {
        console.log('Initializing submodule: ', submodules[i]);
        if (submodules[i].lastIndexOf('.js') === submodules[i].length - 3)
            require('./modules/' + submodules[i])(db, env.DOTCLOUD_STORE_REDIS_URL);
    }
}

// Module routes
function declareRoute(module, endpoint, method, procedure) {
    app[method]('/' + module + '/' + endpoint, function(req, res) {
        var params = Object.keys(req.params).reduce(function(prev, item) {
            prev[item] = req.params[item];
            return prev;
        }, {});
        io.call(module, procedure)({
            params: params,
            body: req.body,
            query: req.query
        }, function(r) { res.send(r.msg, r.code || 200)});
    });
}

var routes = JSON.parse(fs.readFileSync('./modules/routes.json'));
for (var module in routes) {
    console.log('# Routes for ' + module);
    for (var endpoint in routes[module]) {
        console.log('   - ' + endpoint, ': ', routes[module][endpoint]);
        declareRoute(module, endpoint, routes[module][endpoint].method,
            routes[module][endpoint].procedure);
    }
}

// Version endpoint
app.get('/version', function(req, res) {
    res.send('0.81');
});

// Start stack.io browser gateway
io.browser(app);

app.listen(env.PORT_WWW || 12864);
console.log("Express server listening on port %d in %s mode", app.address().port, app.settings.env);