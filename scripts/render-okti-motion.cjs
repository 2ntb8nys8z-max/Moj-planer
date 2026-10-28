// Manual asset generation; ordinary builds copy the checked-in tested media.
const {spawnSync}=require('node:child_process'),path=require('node:path');
const result=spawnSync(process.env.PLANNER_PYTHON||'python3',[path.join(__dirname,'render-okti-motion.py')],{stdio:'inherit'});
if(result.error)throw result.error;
process.exitCode=result.status??1;
