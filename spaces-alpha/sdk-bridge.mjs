import { DiscordSDK } from '@discord/embedded-app-sdk';
// Public application ID only; no credentials or token requests.
export async function connect(){const client=new DiscordSDK('1573885202671996939');let timer;try{await Promise.race([client.ready(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Discord handshake timeout')),10000)})]);return client;}finally{clearTimeout(timer)}}
