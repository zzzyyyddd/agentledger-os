// Challenges are 32 random bytes encoded as unpadded base64url by the server.
// Browser Buffer polyfills do not necessarily support Node's "base64url" encoding.
export function decodeChallengeNonce(value:string):Uint8Array {
 if(typeof value!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(value))throw Error('Invalid wallet challenge');
 let decoded:string;
 try{decoded=atob(value.replace(/-/g,'+').replace(/_/g,'/')+'=');}catch{throw Error('Invalid wallet challenge');}
 if(decoded.length!==32)throw Error('Invalid wallet challenge');
 return Uint8Array.from(decoded,c=>c.charCodeAt(0));
}
