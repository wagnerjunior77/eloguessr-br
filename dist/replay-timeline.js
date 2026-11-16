(function(root){
  'use strict';
  class Timeline {
    constructor(events){this.events=events;this.base=events[0]?.time||0;this.index=0;this.position=-1;this.state={pov:null,pano:null,panoZoom:null,mapPos:null,mapZoom:null,pin:null,visible:false};}
    seek(ms){
      const reset=ms<this.position;
      if(reset){this.index=0;this.state={pov:null,pano:null,panoZoom:null,mapPos:null,mapZoom:null,pin:null,visible:false};}
      const changed=new Set(reset?['pov','pano','panoZoom','mapPos','mapZoom','pin','visible']:[]);
      const end=this.base+Math.max(0,ms);
      while(this.index<this.events.length && this.events[this.index].time<=end){
        const e=this.events[this.index++],p=e.payload;
        if(e.type==='PanoPov'&&Number.isFinite(p.heading)&&Number.isFinite(p.pitch)){this.state.pov={heading:p.heading,pitch:p.pitch};changed.add('pov')}
        else if(e.type==='PanoPosition'&&typeof p.panoId==='string'){this.state.pano=p.panoId;changed.add('pano')}
        else if(e.type==='PanoZoom'&&Number.isFinite(p.zoom)){this.state.panoZoom=p.zoom;changed.add('panoZoom')}
        else if(e.type==='MapPosition'&&Number.isFinite(p.lat)&&Number.isFinite(p.lng)){this.state.mapPos={lat:p.lat,lng:p.lng};changed.add('mapPos')}
        else if(e.type==='MapZoom'&&Number.isFinite(p.zoom)){this.state.mapZoom=p.zoom;changed.add('mapZoom')}
        else if((e.type==='PinPosition'||e.type==='GuessWithLatLng')&&Number.isFinite(p.lat)&&Number.isFinite(p.lng)){this.state.pin={lat:p.lat,lng:p.lng};changed.add('pin')}
        else if(e.type==='MapDisplay'){this.state.visible=!!p.isActive;changed.add('visible')}
      }
      this.position=ms;return {state:this.state,changed};
    }
  }
  root.ReplayTimeline=Timeline;
  if(typeof module==='object'&&module.exports)module.exports=Timeline;
})(globalThis);
