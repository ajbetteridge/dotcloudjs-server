try {
    var env = JSON.parse(fs.readFileSync('/home/dotcloud/environment.json'));
} catch (e) {
    env = process.env;
}

var module = process.argv[2],
    REGISTRAR_ENDPOINT = env.REGISTRAR_ENDPOINT || 'tcp://127.0.0.1:27615';

// Database configuration
var dbConfig = {
    host: env.DOTCLOUD_DB_MONGODB_HOST || 'localhost',
    port: parseInt(env.DOTCLOUD_DB_MONGODB_PORT) || 27017,
    user: env.DOTCLOUDJS_MONGO_USER || null,
    password: env.DOTCLOUDJS_MONGO_PWD || null,
    stackid: env.DOTCLOUDJS_STACKID || null
},
    db = require("./connectors/db")(null, dbConfig);

require('stack.io').io({ registrar: REGISTRAR_ENDPOINT }, function(err, io) {
    if (err) throw err;
    io.expose(module, env[module.toUpperCase() + '_ENDPOINT'],
        require('./modules/' + module)(db));
    console.log('-- Lightweight starter -> module ', module, ' has been started.');
});