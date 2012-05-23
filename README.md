# dotcloudjs-server
node.js server running on express. Exposes services through the [stack.io](https://github.com/dotcloud/stack.io) transport library. Meant to be used in conjuction with [dotcloudjs-client](https://github.com/dotcloud/dotcloudjs-client)

## Deployment
We use a few environment variables that indicate how to access the necessary resources (redis, mongo). Make sure they are set if need be.

* `DOTCLOUD_DB_MONGODB_[LOGIN|PASSWORD|HOST|PORT]` Optional, will default to mongo://localhost:27017
* `DOTCLOUD_STORE_REDIS_URL` Optional. Will default to redis://localhost:6379
* `DOTCLOUDJS_STACKID` Required. Must be the identical to the stack id used by dotcloudjs-client.
