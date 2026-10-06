// Static and development builds use fictional data. The local Rust companion
// overrides this file with mode="live" for the AWS-connected app.
globalThis.REINVENT_RUNTIME=Object.freeze({mode:'demo'});
