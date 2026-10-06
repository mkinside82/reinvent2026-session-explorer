import {mkdir,copyFile,cp,rm} from 'node:fs/promises';
await rm('dist',{recursive:true,force:true});
await mkdir('dist',{recursive:true});
for (const file of ['index.html','styles.css','runtime-config.js','sessions.demo.json','side-events.verified.json']) await copyFile(file,`dist/${file}`);
await cp('src','dist/src',{recursive:true});
console.log('Static site ready');
