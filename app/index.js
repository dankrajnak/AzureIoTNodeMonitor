import IoTMonitor from './IoTMonitor';

let monitor = new IoTMonitor("HostName=FreeHeartfeltHub.azure-devices.net;DeviceId=backup;SharedAccessKey=ydGeQEtWwy/7pGGdeFDvhx4omSyNKD02g1stoq1971s=");
monitor.connect().then(()=>{
  monitor.forkProcess('build/repeater.js');
})
