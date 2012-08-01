module.exports = function(mongo) {
    var ops = mongo.operations;

    var proxy = function(cb) {
        return function(error, data) {
            if (data && data._id) {
                data._id = data._id.toString();
            } else if (data && data.constructor == Array) {
                data.forEach(function(x) { x._id = x._id ? x._id.toString() : undefined });
            }

            return cb ? cb(error, data) : undefined;
        };
    };

    var service = {
        find: function(dbid, collection, criteria, cb) {
            ops.collection('public', dbid + '.' + collection, function(err, c) {
                if (err) return cb(err);
                if (typeof criteria == 'string') {
                    ops.findById(c, criteria, proxy(cb));
                } else if (criteria) {
                    ops.query(c, criteria, proxy(cb));
                } else {
                    ops.findAll(c, proxy(cb));
                }
            });
        },
        remove: function(dbid, collection, id, cb) {
            ops.collection('public', dbid + '.' + collection, function(err, c) {
                if (err) return cb(err);
                if (id) {
                    ops.removeById(c, id, proxy(cb));
                } else {
                    ops.removeAll(c, proxy(cb));
                }
            });
        },
        insert: function(dbid, collection, obj, cb) {
            ops.collection('public', dbid + '.' + collection, function(err, c) {
                if (err) return cb(err);
                ops.insert(c, obj, proxy(cb));
            });
        },
        update: function(dbid, collection, criteria, update, cb) {
            ops.collection('public', dbid + '.' + collection, function(err, c) {
                if (err) return cb(err);

                if (typeof criteria == 'string') {
                    ops.updateById(c, criteria, update, proxy(cb));
                } else {
                    ops.update(c, criteria, update, true, proxy(cb));
                }
            });
        },
        upsert: function(dbid, collection, criteria, update, cb) {
            ops.collection('public', dbid + '.' + collection, function(err, c) {
                if (err) return cb(err);
                ops.upsert(c, criteria, update, proxy(cb));
            });
        }
    };

    return service;
};