module.exports = function(mongo) {
    console.log('twilio module instantiation');
    var request = require('request');
    var proxy = function(cb) {
        return function(error, data) {
            return cb ? cb({
                error: error,
                result: data
            }) : undefined;
        };
    };   


    /*
        Code related to persistence
    */
    var storage = {};

    mongo.operations.collection('public', '_private.twilio.calls', function(err, coll) {
        storage.calls = coll;
        mongo.operations.collection('public', '_private.twilio.keys', function(err, coll) {
            storage.keys = coll;
        });
    });

    storage.findCall = function(id, cb) {
        mongo.operations.findById(storage.calls, id, function(error, data){
            if(error) {
                console.log("Could not save call, failed with error: ");
                console.log(error);
                cb(error);
            }
            cb(null, data);
        });
    };
    storage.saveCall = function(obj, cb) {
        mongo.operations.insert(storage.calls, obj, proxy(cb));
    };
    storage.saveKey = function(obj, cb) {
        mongo.operations.insert(storage.keys, obj, proxy(cb));
    };
    storage.findKey =function(obj, cb) {
        mongo.operations.query(storage.keys, obj, proxy(cb));
    };
    storage.updateKey =function(id, obj, cb) {
        mongo.operations.updateById(storage.keys, id, obj, proxy(cb));
    };


    /*
        The actual module code
    */
    var twilio = {
        APIHost : '__api_host__',
        baseUrl : 'https://api.twilio.com',
        apiUrl  : 'https://api.twilio.com/2010-04-01'
    };

    twilio.credentials = function(sid, cb) {
        storage.findKey({sid: sid}, function(data){
            var cred = {};
             if(data.error || data.result.length === 0 || !data.result[0].sid || !data.result[0].token) {
                return cb(data.error || 'Error setting credentials from given SID');
             }
            var token = data.result[0].token;

            cred.accountUrl = twilio.apiUrl + '/Accounts/' + sid;
            cred.sid = sid;
            cred.token = token;
            cred.authString = "Basic " + new Buffer(sid + ':' + token).toString('base64');              

            cb(null, cred);
        });
    };

    twilio.query = function(cred, opt, cb) {
        if(undefined === cred.authString) throw "No authString defined";

        if(opt.headers === undefined) opt.headers = {};

        opt.headers.Authorization = cred.authString;
        
        request(opt, function(err, resp, body){
            console.log("Query Error: ", err);
            console.log("Query Resp: ", resp.status);
            console.log("Query Body: ", body);
            cb(err, body);
        });
    };
    twilio.post = function(cred, url, form, cb) {
        var opt = {url: url, form: form, method: 'POST'};
        console.log("POST query: ", opt);
        twilio.query(cred, opt, cb);
    };
    twilio.get = function(cred, url, cb) {
        var opt = {url: url, method: 'GET'};
        
        twilio.query(cred, opt, cb);
    };

    twilio._sendSMS = function(cred, sms, cb) {
        twilio.post(cred, cred.accountUrl + '/SMS/Messages.json', sms, cb);
    };
    
    twilio._makeCall = function(cred, call, cb) {
        // Save the given xml message
        if(call.xml || call.say) {
            var obj;

            if(call.xml) {
                console.log('Call xml given:');
                console.log(call.xml);
                obj = {xml: call.xml};
            }
            else {
                console.log('Call say given:');
                console.log(call.say);
                obj = {say: call.say};
            }
            

            storage.saveCall(obj, function(data){
                if(data.error || !data.result) {
                    console.log('Save call error');
                    console.log(data.error);
                    return;
                }

                var id = data.result._id;

                console.log('Save call with id: ' + id);

                call.Url = twilio.APIHost + '/twilio/call?id=' + id;
                console.log('Callback API URL: ' + call.Url);
                twilio.post(cred, cred.accountUrl + '/Calls', call, cb);
            });
        }
        else {
            console.log("No 'xml' nor 'say' attribute given");
        }
    };
    
    /*
        Exposed stack IO methods
    */
    twilio.sendSMS = function(sid, sms, cb) {
        if(undefined === sms)        return console.log("No SMS object given");
        if(undefined === sms.From)   return console.log("No 'From' attribute in SMS object");
        if(undefined === sms.To)     return console.log("No 'To' attribute in SMS object");
        if(undefined === sms.Body)   return console.log("No 'Body' attribute in SMS object");

        twilio.credentials(sid, function(err, cred){
            if (err)
                return cb(err);
            twilio._sendSMS(cred, sms, cb);
        });
        
    };
    
    twilio.makeCall = function(sid, call, cb) {
        if(undefined === call)       return console.log("No CALL object given");
        if(undefined === call.From)  return console.log("No 'From' attribute in CALL object");
        if(undefined === call.To)    return console.log("No 'To' attribute in CALL object");

        twilio.credentials(sid, function(err, cred){
            if (err)
                return cb(err);
            twilio._makeCall(cred, call, cb);
        });
    };


    /*
        Exposed API routes
    */
    twilio.setupRoute = function(req, cb) {
        var res = {};

        var sid = req.body.sid;
        var token = req.body.token;

        if(!req.query || !sid || !token) {
            res.status = 500;
            res.msg = "No SID or TOKEN provided: \n" +  JSON.stringify(req) + "\n";
            return cb(res);
        }

        storage.findKey({sid: sid}, function(data){
            if(data.error) {
                return cb(data.error);
            }

            // new insertion
            if(data.result.length === 0){
                storage.saveKey({sid: sid, token: token}, function(data){
                    res.status = 200;
                    res.msg = JSON.stringify(data) + "\n";
                    cb(null, res);
                });
            }
            // update
            else if(data.result.length === 1){
                var newToken = req.body.newToken;
                if(newToken && data.result[0].token === token){
                    storage.updateKey(data.result[0]._id.toString(), {sid: sid, token: newToken}, function(data){
                        res.status = 200;
                        res.msg = "Token set" + "\n";
                        return cb(null, res);
                    });
                }
                else {
                    res.status = 400;
                    res.msg = "You have to give both a newToken and the actual token\n";
                    //res.msg += JSON.stringify({data: data, query: req.body}) + "\n";
                    return cb(null, res);
                }
            }
            // wtf ?
            else {
                res.status = 400;
                res.msg = "This is the end of the world\n";
                res.msg += JSON.stringify(data) + "\n";
                return cb(null, res);
            }
        });
    };

    twilio.callRoute = function(req, cb) {
        var res = {};
        res.status = 500;
        res.msg = "Fail";

        if(undefined === req.query.id) {
            res.status = 400;
            res.msg = "No id given";
            return cb(null, res);
        }
    
        console.log("twilio callRoute with", req.query.id);

        storage.findCall(req.query.id, function(err, data) {
            if (err) {
                console.error(err);
            } else if(data.xml) {
                console.log('Found xml data', data);
                res.status = 200;
                res.msg = data.xml;
            }
            else if (data.say) {
                console.log('Found SAY data', data);
                res.status = 200;
                res.msg = '<?xml version="1.0" encoding="UTF-8" ?><Response><Say>' + data.say + '</Say></Response>';
            }
            else {
                console.log("No data in mongo call object");
                console.log(data);
            }
            return cb(err, res);
        });

    };

    return twilio;
};