import{c as v}from"./main-DiNIFp5J.js";const m=[{path:"symbols/fibonacci.png",absolutePath:"/mock/symbols/fibonacci.png",type:"image/png",data:"data:image/svg+xml;charset=utf-8,"+encodeURIComponent(`
      <svg width="100" height="100" xmlns="http://www.w3.org/2000/svg">
        <circle cx="50" cy="50" r="40" fill="#00a2ff" stroke="#ffffff" stroke-width="2"/>
        <text x="50" y="55" font-family="Arial" font-size="12" fill="white" text-anchor="middle">∞</text>
      </svg>
    `),size:1024},{path:"symbols/dreamer.png",absolutePath:"/mock/symbols/dreamer.png",type:"image/png",data:"data:image/svg+xml;charset=utf-8,"+encodeURIComponent(`
      <svg width="100" height="100" xmlns="http://www.w3.org/2000/svg">
        <circle cx="50" cy="50" r="40" fill="#FF644E" stroke="#ffffff" stroke-width="2"/>
        <text x="50" y="55" font-family="Arial" font-size="12" fill="white" text-anchor="middle">🧠</text>
      </svg>
    `),size:1024},{path:"symbols/geometry.png",absolutePath:"/mock/symbols/geometry.png",type:"image/png",data:"data:image/svg+xml;charset=utf-8,"+encodeURIComponent(`
      <svg width="100" height="100" xmlns="http://www.w3.org/2000/svg">
        <polygon points="50,10 85,75 15,75" fill="#00a2ff" stroke="#ffffff" stroke-width="2"/>
      </svg>
    `),size:1024},{path:"symbols/pattern.png",absolutePath:"/mock/symbols/pattern.png",type:"image/png",data:"data:image/svg+xml;charset=utf-8,"+encodeURIComponent(`
      <svg width="100" height="100" xmlns="http://www.w3.org/2000/svg">
        <rect x="25" y="25" width="50" height="50" fill="#00a2ff" stroke="#ffffff" stroke-width="2"/>
        <circle cx="50" cy="50" r="15" fill="#ffffff"/>
      </svg>
    `),size:1024}],f=[{path:"canvas/overview.canvas",absolutePath:"/mock/canvas/overview.canvas",content:{nodes:[{id:"node1",type:"text",x:0,y:0,width:200,height:100,text:"This is a DreamSong about sacred geometry..."}],edges:[]}}];function n(o=12,t){const g=v({radius:5e3,nodeCount:o,center:[0,0,0]}),i=[];for(let e=0;e<o;e++){const[d,l,h]=g[e].position,a=e%3!==0,s=a?"dream":"dreamer",p=a?e%3:1,w=[m[p]],r=`mock-${s}-${e}`,y=t?.get(r)||[];i.push({id:r,type:s,name:a?`Dream ${e+1}`:`Dreamer ${Math.floor(e/3)+1}`,position:[d,l,h],dreamTalkMedia:w,dreamSongContent:f,liminalWebConnections:y,repoPath:`/mock/repos/${s}-${e}`,hasUnsavedChanges:!1})}return i}function u(o,t){switch(o){case"single-node":return[c()];case"fibonacci-12":return n(12,t);case"fibonacci-50":return n(50,t);case"fibonacci-100":return n(100,t);default:return[c()]}}function c(){return{id:"mock-test-dream",type:"dream",name:"Test Dream",position:[5e3,0,0],dreamTalkMedia:[m[0]],dreamSongContent:f,liminalWebConnections:[],repoPath:"/mock/repos/test-dream",hasUnsavedChanges:!1}}export{n as generateMockDreamNodes,u as getMockDataForConfig,c as getSingleTestNode};
