var module = process.argv[2];

try {
    var env = JSON.parse(fs.readFileSync('/home/dotcloud/environment.json'));
} catch (e) {
    env = process.env;
}

// Database configuration
var dbConfig = {
    host: env.DOTCLOUD_DB_MONGODB_HOST || 'localhost',
    port: parseInt(env.DOTCLOUD_DB_MONGODB_PORT) || 27017,
    user: env.DOTCLOUDJS_MONGO_USER || null,
    password: env.DOTCLOUDJS_MONGO_PWD || null,
    stackid: env.DOTCLOUDJS_STACKID || null
},
    db = require("./connectors/db")(null, dbConfig);

require('./modules/' + module)(db, env.DOTCLOUD_STORE_REDIS_URL);

// Listen to the outside world to avoid dotcloud.js bug
require('net').createServer(function(socket) {
    socket.write(module);
}).listen(env.PORT_WWW || 42800);