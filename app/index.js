import IoTMonitor from './IoTMonitor';

let monitor = new IoTMonitor();
monitor.connect().then(()=>{
  monitor.forkProcess('build/repeater.js');
})
