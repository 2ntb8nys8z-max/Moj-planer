// Explicit recorded-style model replies; not a replacement production parser.
const command=(uiAction)=>({reply:'Sprawdzam.',kind:'command',action:'continue',intent:'execute',proposalId:null,operations:[],focus:'',ambiguity:null,uiAction});
const idea=(text)=>({reply:'Przygotowałem wpis.',kind:'idea',action:'continue',intent:'execute',proposalId:null,operations:[],focus:'',ambiguity:null,idea:{type:'idea',text,action:'replace'}});
module.exports={command,idea};
