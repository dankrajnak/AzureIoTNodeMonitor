import IoTMonitor from './IoTMonitor';

let monitor = new IoTMonitor();
monitor.connect().then(()=>{
  monitor.clearDeviceTwin();
  monitor.addRunInBackgroundListener('repeat', 'build/repeater.js');
  monitor.forkProcess('build/repeater.js');
})
