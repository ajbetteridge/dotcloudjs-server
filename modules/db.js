module.exports = function(app, mongo, redisUrl) {
    var io = require('stack.io')({
        transport: redisUrl
    });

    var ops = mongo.operations;

    var proxy = function(cb) {
        return function(error, data) {
            return cb ? cb({
                error: error,
                result: data
            }) : undefined;
        };
    };

    var service = {
        find: function(dbid, collection, criteria, cb) {
            var c = ops.collection(mongo.public(), dbid + '.' + collection);
            if (typeof criteria == 'string') {
                ops.findById(c, criteria, proxy(cb));
            } else if (criteria) {
                ops.query(c, criteria, proxy(cb));
            } else {
                ops.findAll(c, proxy(cb));
            }
        },
        remove: function(dbid, collection, id, cb) {
            var c = ops.collection(mongo.public(), dbid + '.' + collection);
            if (id) {
                ops.removeById(c, id, proxy(cb));
            } else {
                ops.removeAll(c, proxy(cb));
            }
        },
        insert: function(dbid, collection, obj, cb) {
            var c = ops.collection(mongo.public(), dbid + '.' + collection);
            ops.insert(c, obj, proxy(cb));
        },
        update: function(dbid, collection, criteria, update, cb) {
            var c = ops.collection(mongo.public(), dbid + '.' + collection);
            if (typeof criteria == 'string') {
                ops.updateById(c, criteria, update, proxy(cb));
            } else {
                ops.update(c, criteria, update, true, proxy(cb));
            }
        },
        upsert: function(dbid, collection, criteria, update, cb) {
            var c = ops.collection(mongo.public(), dbid + '.' + collection);
            ops.upsert(c, criteria, update, proxy(cb));
        }
    };

    io.expose('db', service);
};