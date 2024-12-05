export default 
class StatCaculator {
  constructor () {
    this.lastReportStat= null;
    this.jitterbufferDelayCrt = 0;
    this.jitterbufferTargetDelayCrt = 0;
    this.jitterbufferMinimunDelayCrt = 0;
    this.jitterBufferEmittedCountCrt = 0;
  }

  updateStat(stat) {
    if(!this.lastReportStat){
      return this.lastReportStat = stat;
    }

    this.jitterbufferDelayCrt = stat.jitterBufferDelay - this.lastReportStat.jitterBufferDelay;
    this.jitterbufferTargetDelayCrt = stat.jitterBufferTargetDelay - this.lastReportStat.jitterBufferTargetDelay;
    this.jitterbufferMinimunDelayCrt = stat.jitterBufferMinimumDelay - this.lastReportStat.jitterBufferMinimumDelay;
    this.jitterBufferEmittedCountCrt = stat.jitterBufferEmittedCount - this.lastReportStat.jitterBufferEmittedCount;
    return this.lastReportStat = stat;
  }
  
  getJittbufferDelay() {
    return [this.jitterbufferDelayCrt, this.jitterbufferTargetDelayCrt, this.jitterbufferMinimunDelayCrt, this.jitterBufferEmittedCountCrt];
  }
}
