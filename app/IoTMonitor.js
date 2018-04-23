const {fork, execSync} = require('child_process');
const Client = require('azure-iot-device').Client;
const ConnectionString = require('azure-iot-device').ConnectionString;
const Message = require('azure-iot-device').Message;
const Protocol = require('azure-iot-device-mqtt').Mqtt;

if (process.env.NODE_ENV !== 'production') {
  require('dotenv').load();
}

export default class IoTMonitor{
  constructor(connectionString = false){
    this.methodListeners = [];
    this.backProcessesRunning = [];
    this.connectionString = connectionString || process.env['AzureIoTHubDeviceConnectionString'];
    this.client = null;
    this.connected = false;
  }

  /**
   * Listens for an `eventName` device method.  Once received, create a new instance
   * of node running in a seperate process and run `fileName`. All output from
   * that process will be sent to the IoTHub as an event.
   *
   * @param {string} eventName Name of event to listen to from the IotHub
   * @param {string} fileName  Relative path to the javascript file
   */
  addRunInBackgroundListener(eventName, fileName){
    this.methodListeners.push({
      type: 'background',
      eventName: eventName,
      fileName: fileName
    });
    this.client.onDeviceMethod(eventName, (res, req)=>this._forkProcessCallback(res, req, fileName));
  }

  /**
   * Listens for an `eventName` device method.  Once received, runs the provided
   * method in the same thread as the IoT Monitor.  This is meant for short methods
   * and avoids the creation of a separate process.  Consider, though, that while
   * the method is running, IoTMonitor will be unresponsive.
   * @param {string} eventName  name of the device method to listen for
   * @param {function} method    method to run on reciept of the eventName
   */
  addSameThreadMethodListener(eventName, method){
    this.methodListeners.push({
      type: 'same thread',
      eventNamae: eventName,
      method: method
    });

    this.client.onDeviceMethod(eventName, (res, req)=>this._runSameThreadCallBack(res, req, method));

  }

  /**
   * Connect to Azure IoTHub
   * @return {Promise} A promise that resolves when successfully connected, and
   *  rejects with any errors encountered.
   */
  connect(){
    return new Promise((resolve, reject)=>{
      try{
        this.client = Client.fromConnectionString(this.connectionString, Protocol);
      } catch(e){
        reject(e);
      }
      this.client.open((err)=>{
        if(err){
          reject(err);
        } else{
          this.connected = true;
          this.client.sendEvent(new Message('Connected!'));
          console.log('Connected!')
          resolve();
        }
      })
    })
  }

  /**
   * Run a method on the same thread as the IoTMonitor.
   * Meant for simple, synchronous methods which quickly terminate.
   * Avoids creating another Node instance.
   *
   * @param  {function} method method to be run on the same thread.
   * @param  {Array} args   Parameters to be passed into the method.
   */
  runOnSameThread(method, args){
   // Re-write console.log.
   // This might be a really stupid way to do this.
   // It also won't work if the method is asynchronous.  It will revert
   // console.log before those methods run.
    let consoleLog = console.log;
    console.log = ()=>{
      let logs = arguments;
      if(this.connected){
        this.client.sendEvent(new Message(`Log from ${method.name}: ${logs}`));
      }
      consoleLog(arguments);
    }
    try {
      method(...args);
    } catch (e) {
      if(this.connected){
        this.client.sendEvent(new Message(`Error in ${method.name}: ${e}`));
        consoleLog(e);
      }
    } finally{
      console.log = consoleLog;
    }
  }

  /**
   * Creates a new instance of node and runs the fileName on this new instance.
   * Reports any output of this process to the Azure IoTHub.
   * @param  {string} fileName absolute path to the node script to be forked.
   */
  forkProcess(fileName){
    if(!this.connected){
      console.error('Client not connected while forking process');
    } else{
      console.log('Here');
      this.client.sendEvent(new Message('Forking '+fileName));
      console.log('And there');
    }

    let forked;

    try{
      forked = fork(fileName, [], { silent: true });
    }
    catch(error){
      if(this.connected){
        this.client.sendEvent(new Message('Error forking '+fileName+": "+error))
      }
      console.error('Error forking '+fileName, error);
      return false;
    }

    forked.on('error', (error)=>{
      if(this.connected){
        this.client.sendEvent(new Message(`Error forking ${fileName}: ${error.toString()}`),
         (err)=>IoTMonitor._handleMessageSendError);
      }
      console.error('Error forking '+ fileName, error)
      return false;
    })

    this.backProcessesRunning.push({
      fileName: fileName,
      fork: forked
    })

    forked.on('exit', (code, signal)=>{
      if(this.connected){
        this.client.sendEvent(new Message(`${fileName} ended on code ${code}`),
          (err)=>IoTMonitor._handleMessageSendError);
      }
      console.log(fileName + ' ended');
    })

    if(this.connected){
      forked.stdout.on('data', (data)=>{
        this.client.sendEvent(new Message(`Message from ${fileName}: ${data.toString()}`),
         (err)=>IoTMonitor._handleMessageSendError)
      });

      forked.stderr.on('data', (data)=>{
        this.client.sendEvent(new Message(`Error in ${fileName}: ${data.toString}`),
         (err)=>IoTMonitor._handleMessageSendError)
      });
    }
    return true;
  }

  _forkProcessCallback(request, response, fileName){
    console.log('Got message to fork ' + fileName);
    if(this.forkProcess(fileName)){
      response.send(200, 'Successfully forked ' + fileName, (err)=>{
        if (err){
          IoTMonitor._handleMessageSendError(err);
        }
      })
    } else{
      response.send(500, 'Error Forking ' + fileName, (err)=>{
        if(err){
          IoTMonitor._handleMessageSendError(err);
        }
      })
    }
  }

  _runOnSameThreadCallback(request, response, method){
    console.log('Got message to run '+ method.name+'('+request.payload||''+')')

    if(this.runOnSameThread(method, request.payload)){
      response.send(200, 'Successfully ran '+method.name+'('+request.payload||''+')', (err)=>{
        if (err){
          IoTMonitor._handleMessageSendError(err);
        }
      })
    } else{
      response.send(500, 'Error running ' + method.name, (err)=>{
        if(err){
          IoTMonitor._handleMessageSendError(err);
        }
      })
    }
  }

  static _handleMessageSendError(error){
    console.error(error);
  }
}
