import { useState, useEffect, useRef, useCallback } from "react";

// ─── ST ENGINEERING BRAND TOKENS ─────────────────────────────────────────────
const ST = {
  red:     "#E30613",
  redDark: "#B71C1C",
  redLight:"#FFEBEE",
  dark:    "#404040",
  mid:     "#565D65",
  light:   "#8A9099",
  bg:      "#F4F5F6",
  white:   "#FFFFFF",
  border:  "#D8DADC",
  green:   "#2E7D32",
  amber:   "#E65100",
  muted:   "#CFD2D5",
};

// ─── MOCK API DATA ────────────────────────────────────────────────────────────
const MOCK_CONFIG = {
  freqMode:"smart", freqDefault:0,
  freqList:[1200000000,1250000000,1300000000],
  span:2, meshName:"ZENITH-NET", id:5,
  ip:"192.168.10.5", nwMask:"255.255.255.0",
  rangeMode:"10", dataEncryptionMode:1,
  pwAtten1:10, pwAtten2:10,
};

const MOCK_STATUS = {
  nodeNumber:5, selfId:5, ip:"192.168.10.5",
  temp:58.4, batteryLevel:82, silenced:false, operatingFreq:0,
  nodeInfos:[
    {id:1,ip:"192.168.10.1",latitude:1.2855,longitude:103.8120,altitude:45,resourceRatio:0.52},
    {id:3,ip:"192.168.10.3",latitude:1.2848,longitude:103.8115,altitude:38,resourceRatio:0.48},
    {id:5,ip:"192.168.10.5",latitude:1.2852,longitude:103.8119,altitude:51,resourceRatio:0.61},
    {id:7,ip:"192.168.10.7",latitude:1.2862,longitude:103.8124,altitude:33,resourceRatio:0.44},
    {id:9,ip:"192.168.10.9",latitude:1.2843,longitude:103.8109,altitude:29,resourceRatio:0.39},
  ],
  linkQuality:[
    [-10,-10,24,-10,18],
    [-10,-10,-10,22,-10],
    [24,-10,-10,26,21],
    [-10,22,26,-10,-10],
    [18,-10,21,-10,-10],
  ],
  transmissionDelay:[
    {id:1,delay:127},{id:3,delay:203},{id:7,delay:89},{id:9,delay:156},
  ],
};

const MOCK_DEVICE_INFO = {
  version:"2.12.1-rc10-M1022", deviceType:"M1022",
  deviceSn:"21cf0d82dff53a91a4cfa76111b07a9f",
  freqMax:1500000000, freqMin:1200000000,
  powerMax:27, chipLevel:0, powerMaxAtten:7,
  licenseinfo:{
    maxNodeNum:64, maxThroughput:50000,
    freqHopping:true, freqSmart:true, freqSmartAdvanced:true,
    adaptiveFreqHopping:true, dataEncryptionAES256:true,
    dataEncryptionAES128:true, wifi:true, silence:true, supportedWaveform:3,
  },
};

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const FREQ_MODES={single:"SINGLE",roaming:"ROAMING",hop:"FHSS",hop2:"FHSS(L)",smart:"SMART",adaptiveHopping:"FHSS(A)",smartAdvanced:"SMART(A)"};
const BANDWIDTH_MAP={0:"2.5 MHz",1:"5 MHz",2:"10 MHz",3:"20 MHz",6:"300 KHz",7:"30 MHz",8:"1.25 MHz",9:"250 KHz",10:"500 KHz",11:"1 MHz"};
const ENCRYPTION_MAP={0:"None",1:"AES-256",2:"AES-128",3:"DES"};

function fmtFreq(hz){
  if(!hz)return"–";
  if(hz>=1e9)return(hz/1e9).toFixed(3)+" GHz";
  if(hz>=1e6)return(hz/1e6).toFixed(1)+" MHz";
  return hz+" Hz";
}

function snrColor(snr){
  if(snr<=-10)return ST.muted;
  if(snr<10)  return ST.amber;
  if(snr<20)  return ST.green;
  return ST.red;
}

// ─── NAV ─────────────────────────────────────────────────────────────────────
const NAV=[
  {id:"status",   label:"Status",      children:[]},
  {id:"topology", label:"Topology",    children:[{id:"topology-link",label:"Link"},{id:"topology-table",label:"Table"}]},
  {id:"rf",       label:"RF",          children:[]},
  {id:"network",  label:"Network",     children:[
    {id:"network-global",label:"Global Settings"},{id:"network-basic",label:"Basic"},
    {id:"network-advance",label:"Advance"},{id:"network-rf",label:"RF"},
    {id:"network-data",label:"Data"},{id:"network-uart",label:"UART"},
    {id:"network-audio",label:"Audio"},{id:"network-gps",label:"GPS"},
  ]},
  {id:"security", label:"Security",    children:[{id:"security-encryption",label:"Encryption"},{id:"security-login",label:"Login"}]},
  {id:"device",   label:"Device Info", children:[{id:"device-about",label:"About"},{id:"device-update",label:"Update"}]},
];

// ─── SHARED ATOMS ─────────────────────────────────────────────────────────────
function Card({children,style}){
  return <div style={{background:ST.white,border:`1px solid ${ST.border}`,borderRadius:4,...style}}>{children}</div>;
}
function SectionTitle({children}){
  return <div style={{fontSize:10,fontWeight:700,color:ST.mid,letterSpacing:1.5,textTransform:"uppercase",marginBottom:14,paddingBottom:6,borderBottom:`2px solid ${ST.red}`,display:"inline-block"}}>{children}</div>;
}

// ─── TOPOLOGY CANVAS ─────────────────────────────────────────────────────────
function TopologyCanvas({nodes,linkQuality,selfId}){
  const canvasRef=useRef(null);
  const animRef=useRef(null);
  const phaseRef=useRef(0);

  const positions={};
  nodes.forEach(n=>{
    if(n.id===selfId){
      positions[n.id]={x:0.5,y:0.44};
    } else {
      const others=nodes.filter(x=>x.id!==selfId);
      const oi=others.indexOf(n);
      const angles=[-0.6,0.6,Math.PI-0.6,Math.PI+0.6];
      const a=angles[oi]??(oi*Math.PI*2/others.length);
      positions[n.id]={
        x:0.5+0.3*Math.cos(a-Math.PI/2),
        y:0.44+0.28*Math.sin(a-Math.PI/2),
      };
    }
  });

  const draw=useCallback(()=>{
    const canvas=canvasRef.current;
    if(!canvas)return;
    const ctx=canvas.getContext("2d");
    const W=canvas.width,H=canvas.height;
    phaseRef.current+=0.016;
    ctx.clearRect(0,0,W,H);

    // Background
    ctx.fillStyle="#F8F9FA";
    ctx.fillRect(0,0,W,H);

    // Dot grid
    ctx.fillStyle="rgba(86,93,101,0.1)";
    for(let gx=0;gx<W;gx+=28)for(let gy=0;gy<H;gy+=28){
      ctx.beginPath();ctx.arc(gx,gy,1,0,Math.PI*2);ctx.fill();
    }

    // Links
    nodes.forEach((na,i)=>{
      nodes.forEach((nb,j)=>{
        if(j<=i)return;
        const snr=linkQuality[i]?.[j]??-10;
        if(snr<=-10)return;
        const pa=positions[na.id],pb=positions[nb.id];
        if(!pa||!pb)return;
        const ax=pa.x*W,ay=pa.y*H,bx=pb.x*W,by=pb.y*H;
        const col=snrColor(snr);
        ctx.save();
        ctx.shadowBlur=8;ctx.shadowColor=col+"55";
        const g=ctx.createLinearGradient(ax,ay,bx,by);
        g.addColorStop(0,col+"88");g.addColorStop(0.5,col+"dd");g.addColorStop(1,col+"88");
        ctx.strokeStyle=g;ctx.lineWidth=2;
        ctx.setLineDash([7,5]);ctx.lineDashOffset=-phaseRef.current*7;
        ctx.beginPath();ctx.moveTo(ax,ay);ctx.lineTo(bx,by);ctx.stroke();
        ctx.restore();
        // SNR label
        ctx.save();
        ctx.font="bold 9px Arial";ctx.fillStyle=col;
        ctx.textAlign="center";ctx.textBaseline="middle";
        ctx.fillText(`${snr} dB`,(ax+bx)/2,(ay+by)/2-9);
        ctx.restore();
      });
    });

    // Nodes
    nodes.forEach(n=>{
      const p=positions[n.id];
      if(!p)return;
      const cx=p.x*W,cy=p.y*H,isSelf=n.id===selfId,R=isSelf?30:22;
      if(isSelf){
        const pr=R+10+5*Math.sin(phaseRef.current*1.6);
        ctx.save();
        ctx.beginPath();ctx.arc(cx,cy,pr,0,Math.PI*2);
        ctx.strokeStyle=`rgba(227,6,19,${0.18+0.1*Math.sin(phaseRef.current)})`;
        ctx.lineWidth=2;ctx.stroke();ctx.restore();
      }
      ctx.save();
      ctx.shadowBlur=isSelf?20:10;ctx.shadowColor=isSelf?ST.red+"88":ST.mid+"44";
      const g=ctx.createRadialGradient(cx-R*0.3,cy-R*0.3,0,cx,cy,R);
      if(isSelf){g.addColorStop(0,"#E30613");g.addColorStop(1,"#B71C1C");}
      else{g.addColorStop(0,"#FFFFFF");g.addColorStop(1,"#E8EAEC");}
      ctx.beginPath();ctx.arc(cx,cy,R,0,Math.PI*2);
      ctx.fillStyle=g;ctx.fill();
      ctx.strokeStyle=isSelf?ST.redDark:ST.mid;ctx.lineWidth=isSelf?2.5:1.5;
      ctx.stroke();ctx.restore();
      ctx.save();
      ctx.font=`bold ${isSelf?13:12}px Arial`;
      ctx.fillStyle=isSelf?"#FFFFFF":ST.dark;
      ctx.textAlign="center";ctx.textBaseline="middle";
      ctx.fillText(n.id,cx,cy);ctx.restore();
      ctx.save();
      ctx.font="9px Arial";ctx.fillStyle=isSelf?ST.red:ST.light;
      ctx.textAlign="center";ctx.fillText(`.${n.ip.split(".").pop()}`,cx,cy+R+11);
      ctx.restore();
    });

    animRef.current=requestAnimationFrame(draw);
  },[nodes,linkQuality,selfId]);

  useEffect(()=>{animRef.current=requestAnimationFrame(draw);return()=>cancelAnimationFrame(animRef.current);},[draw]);
  useEffect(()=>{
    const canvas=canvasRef.current;if(!canvas)return;
    const resize=()=>{canvas.width=canvas.offsetWidth;canvas.height=canvas.offsetHeight;};
    resize();const ro=new ResizeObserver(resize);ro.observe(canvas);return()=>ro.disconnect();
  },[]);

  return <canvas ref={canvasRef} style={{width:"100%",height:"100%",display:"block"}}/>;
}

// ─── LINK TABLE ───────────────────────────────────────────────────────────────
function LinkTable({nodes,linkQuality}){
  const th={padding:"8px 14px",color:ST.mid,fontSize:11,fontWeight:700,textAlign:"left",background:"#F4F5F6",borderBottom:`1px solid ${ST.border}`};
  const td={padding:"8px 14px",fontSize:12,color:ST.dark};
  return(
    <div style={{padding:24}}>
      <SectionTitle>Link Quality Matrix (dB SNR)</SectionTitle>
      <Card style={{marginBottom:28,overflow:"hidden"}}>
        <table style={{borderCollapse:"collapse",width:"100%",fontFamily:"Arial,sans-serif",fontSize:12}}>
          <thead><tr>
            <th style={th}>TX \ RX</th>
            {nodes.map(n=><th key={n.id} style={{...th,textAlign:"center"}}>Node {n.id}</th>)}
          </tr></thead>
          <tbody>{nodes.map((na,i)=>(
            <tr key={na.id} style={{borderTop:`1px solid ${ST.border}`}}>
              <td style={{...td,fontWeight:700,color:ST.red}}>Node {na.id}</td>
              {nodes.map((nb,j)=>{
                const snr=linkQuality[i]?.[j]??-10;
                return(
                  <td key={nb.id} style={{...td,textAlign:"center"}}>
                    {i===j?<span style={{color:ST.muted}}>—</span>
                      :snr<=-10?<span style={{color:ST.muted}}>–</span>
                      :<span style={{display:"inline-block",padding:"2px 10px",borderRadius:3,background:snrColor(snr)+"18",color:snrColor(snr),border:`1px solid ${snrColor(snr)}55`,fontWeight:700}}>
                        {snr} dB
                      </span>}
                  </td>
                );
              })}
            </tr>
          ))}</tbody>
        </table>
      </Card>
      <SectionTitle>Node Details</SectionTitle>
      <Card style={{overflow:"hidden"}}>
        <table style={{borderCollapse:"collapse",width:"100%",fontFamily:"Arial,sans-serif",fontSize:12}}>
          <thead><tr>{["Node ID","IP Address","Latitude","Longitude","Altitude","Resource Ratio"].map(h=><th key={h} style={th}>{h}</th>)}</tr></thead>
          <tbody>{nodes.map(n=>(
            <tr key={n.id} style={{borderTop:`1px solid ${ST.border}`}}>
              <td style={{...td,fontWeight:700,color:ST.red}}>{n.id}</td>
              <td style={td}>{n.ip}</td>
              <td style={td}>{n.latitude?.toFixed(4)??"–"}</td>
              <td style={td}>{n.longitude?.toFixed(4)??"–"}</td>
              <td style={td}>{n.altitude??"–"} m</td>
              <td style={td}>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <div style={{flex:1,height:5,background:ST.border,borderRadius:3}}>
                    <div style={{width:`${(n.resourceRatio??0)*100}%`,height:"100%",background:ST.red,borderRadius:3}}/>
                  </div>
                  <span style={{color:ST.dark,width:34,fontWeight:700}}>{((n.resourceRatio??0)*100).toFixed(0)}%</span>
                </div>
              </td>
            </tr>
          ))}</tbody>
        </table>
      </Card>
    </div>
  );
}

// ─── RF PANEL ─────────────────────────────────────────────────────────────────
function RFPanel({config}){
  const noiseData=[
    {freq:1200000000,ant1:-95.5,ant2:-93.5},
    {freq:1250000000,ant1:-97.0,ant2:-96.0},
    {freq:1300000000,ant1:-96.0,ant2:-96.0},
  ];
  const freq=config.freqList[config.freqDefault];
  const thS={padding:"9px 16px",color:ST.mid,fontSize:11,fontWeight:700,textAlign:"left",background:"#F4F5F6",borderBottom:`1px solid ${ST.border}`};
  return(
    <div style={{padding:24}}>
      <SectionTitle>RF Configuration</SectionTitle>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:14,marginBottom:28}}>
        {[
          {label:"Operating Frequency",value:fmtFreq(freq)},
          {label:"Bandwidth",value:BANDWIDTH_MAP[config.span]??"–"},
          {label:"Frequency Mode",value:FREQ_MODES[config.freqMode]??config.freqMode},
          {label:"RF1 Attenuation",value:`${config.pwAtten1} dB`},
          {label:"RF2 Attenuation",value:`${config.pwAtten2} dB`},
          {label:"Max TX Power",value:`${MOCK_DEVICE_INFO.powerMax} dBm`},
        ].map(m=>(
          <Card key={m.label} style={{padding:"16px 20px"}}>
            <div style={{color:ST.light,fontSize:10,fontWeight:700,letterSpacing:1.2,marginBottom:8,textTransform:"uppercase"}}>{m.label}</div>
            <div style={{color:ST.red,fontSize:20,fontWeight:700}}>{m.value}</div>
          </Card>
        ))}
      </div>
      <SectionTitle>Ambient Noise RSSI</SectionTitle>
      <Card style={{overflow:"hidden"}}>
        <table style={{borderCollapse:"collapse",width:"100%",fontFamily:"Arial,sans-serif",fontSize:12}}>
          <thead><tr>{["Frequency","Ant 1 RSSI (dBm)","Ant 2 RSSI (dBm)","Delta"].map(h=><th key={h} style={thS}>{h}</th>)}</tr></thead>
          <tbody>{noiseData.map((d,i)=>(
            <tr key={i} style={{borderTop:`1px solid ${ST.border}`}}>
              <td style={{padding:"9px 16px",color:ST.dark,fontWeight:600}}>{fmtFreq(d.freq)}</td>
              <td style={{padding:"9px 16px",color:ST.mid}}>{d.ant1}</td>
              <td style={{padding:"9px 16px",color:ST.mid}}>{d.ant2}</td>
              <td style={{padding:"9px 16px",color:Math.abs(d.ant1-d.ant2)<3?ST.green:ST.amber,fontWeight:700}}>
                {(d.ant1-d.ant2).toFixed(1)}
              </td>
            </tr>
          ))}</tbody>
        </table>
      </Card>
    </div>
  );
}

// ─── DEVICE PANEL ─────────────────────────────────────────────────────────────
function DevicePanel({info}){
  const li=info.licenseinfo;
  const KV=({label,value})=>(
    <div style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:`1px solid ${ST.border}`}}>
      <span style={{color:ST.light,fontSize:12}}>{label}</span>
      <span style={{color:ST.dark,fontSize:12,fontWeight:600}}>{value}</span>
    </div>
  );
  return(
    <div style={{padding:24}}>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:24}}>
        <Card style={{padding:20}}>
          <SectionTitle>Device Identity</SectionTitle>
          <KV label="Device Type" value={info.deviceType}/>
          <KV label="ESN"         value={info.deviceSn?.slice(0,16)+"…"}/>
          <KV label="Firmware"    value={info.version?.trim()}/>
          <KV label="Chip Level"  value={info.chipLevel}/>
        </Card>
        <Card style={{padding:20}}>
          <SectionTitle>RF Parameters</SectionTitle>
          <KV label="Freq Range"   value={`${fmtFreq(info.freqMin)} – ${fmtFreq(info.freqMax)}`}/>
          <KV label="Max Power"    value={`${info.powerMax} dBm`}/>
          <KV label="RF1 Ref Att." value={`${info.powerMaxAtten??7} dB`}/>
          <KV label="Waveform"     value={li?.supportedWaveform===3?"Wideband + NB":"–"}/>
        </Card>
      </div>
      <SectionTitle>Licence Features</SectionTitle>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:24}}>
        {[
          ["AES-256", li?.dataEncryptionAES256],["AES-128",li?.dataEncryptionAES128],
          ["FHSS",    li?.freqHopping],          ["SMART",  li?.freqSmart],
          ["SMART(A)",li?.freqSmartAdvanced],    ["FHSS(A)",li?.adaptiveFreqHopping],
          ["Wi-Fi",   li?.wifi],                 ["Silence",li?.silence],
        ].map(([name,active])=>(
          <div key={name} style={{padding:"10px 14px",borderRadius:4,background:active?ST.redLight:ST.bg,border:`1px solid ${active?ST.red+"55":ST.border}`,display:"flex",alignItems:"center",gap:8}}>
            <div style={{width:7,height:7,borderRadius:"50%",background:active?ST.red:ST.muted,flexShrink:0}}/>
            <span style={{color:active?ST.red:ST.light,fontSize:11,fontWeight:active?700:400}}>{name}</span>
          </div>
        ))}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
        {[
          {label:"Max Nodes",      value:li?.maxNodeNum??"–"},
          {label:"Max Throughput", value:`${(li?.maxThroughput??0)/1000} Mbps`},
        ].map(m=>(
          <Card key={m.label} style={{padding:20,textAlign:"center"}}>
            <div style={{color:ST.light,fontSize:10,fontWeight:700,letterSpacing:1.2,marginBottom:10,textTransform:"uppercase"}}>{m.label}</div>
            <div style={{color:ST.red,fontSize:32,fontWeight:700}}>{m.value}</div>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ─── SETTINGS PANEL ───────────────────────────────────────────────────────────
function SettingsPanel({config}){
  const [form,setForm]=useState({...config});
  const [saved,setSaved]=useState(false);
  const inp={width:"100%",boxSizing:"border-box",border:`1px solid ${ST.border}`,borderRadius:3,padding:"8px 10px",fontSize:12,color:ST.dark,fontFamily:"Arial,sans-serif",outline:"none",background:ST.white};
  const lbl={display:"block",color:ST.mid,fontSize:10,fontWeight:700,letterSpacing:1.2,textTransform:"uppercase",marginBottom:5};
  const field=(label,key,opts=null)=>(
    <div key={key} style={{marginBottom:16}}>
      <label style={lbl}>{label}</label>
      {opts
        ?<select value={form[key]} onChange={e=>setForm(f=>({...f,[key]:e.target.value}))} style={inp}>
           {opts.map(([v,l])=><option key={v} value={v}>{l}</option>)}
         </select>
        :<input value={form[key]??""} onChange={e=>setForm(f=>({...f,[key]:e.target.value}))} style={inp}/>
      }
    </div>
  );
  return(
    <div style={{padding:24}}>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:28}}>
        <Card style={{padding:20}}>
          <SectionTitle>Basic Config</SectionTitle>
          {field("Mesh ID (Network Name)","meshName")}
          {field("Node ID","id")}
          {field("IP Address","ip")}
          {field("Subnet Mask","nwMask")}
          {field("Max Range (km)","rangeMode")}
        </Card>
        <Card style={{padding:20}}>
          <SectionTitle>RF Config</SectionTitle>
          {field("Frequency Mode","freqMode",[["single","SINGLE"],["hop","FHSS"],["hop2","FHSS(L)"],["smart","SMART"],["adaptiveHopping","FHSS(A)"],["smartAdvanced","SMART(A)"]])}
          {field("Bandwidth","span",[["0","2.5 MHz"],["1","5 MHz"],["2","10 MHz"],["3","20 MHz"]])}
          {field("RF1 Attenuation (dB)","pwAtten1")}
          {field("RF2 Attenuation (dB)","pwAtten2")}
          {field("Encryption","dataEncryptionMode",[["0","None"],["1","AES-256"],["2","AES-128"],["3","DES"]])}
        </Card>
      </div>
      <div style={{marginTop:20,display:"flex",gap:12}}>
        <button onClick={()=>{setSaved(true);setTimeout(()=>setSaved(false),2000);}}
          style={{padding:"9px 28px",background:saved?ST.green:ST.red,border:"none",borderRadius:3,color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer"}}>
          {saved?"✓ Saved":"POST Config"}
        </button>
        <button onClick={()=>setForm({...config})}
          style={{padding:"9px 28px",background:"transparent",border:`1px solid ${ST.border}`,borderRadius:3,color:ST.mid,fontSize:12,cursor:"pointer"}}>
          Reset
        </button>
      </div>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function MeshDashboard(){
  const [activeNav,setActiveNav]=useState("status");
  const [expanded,setExpanded]=useState({topology:true});
  const [tick,setTick]=useState(0);
  const config=MOCK_CONFIG,status=MOCK_STATUS;

  useEffect(()=>{const id=setInterval(()=>setTick(t=>t+1),3000);return()=>clearInterval(id);},[]);
  const toggle=id=>setExpanded(e=>({...e,[id]:!e[id]}));

  const chips=[
    {label:"STATUS",    value:"ONLINE",                                    color:"#fff"},
    {label:"MESH ID",   value:config.meshName},
    {label:"NODE ID",   value:config.id},
    {label:"FREQUENCY", value:fmtFreq(config.freqList[config.freqDefault])},
    {label:"BANDWIDTH", value:BANDWIDTH_MAP[config.span]??"–"},
    {label:"RF MODE",   value:FREQ_MODES[config.freqMode]??config.freqMode},
    {label:"RANGE",     value:`${config.rangeMode} km`},
    {label:"ENCRYPT",   value:ENCRYPTION_MAP[config.dataEncryptionMode]??"–"},
  ];

  const renderContent=()=>{
    if(activeNav==="status") return(
      <div style={{display:"flex",flexDirection:"column",height:"100%"}}>
        {/* Stat cards */}
        <div style={{display:"flex",gap:12,padding:"16px 20px 0",flexShrink:0}}>
          {[
            {label:"Nodes Online",value:status.nodeNumber,unit:"",      color:ST.red},
            {label:"Temperature", value:(status.temp+(Math.sin(tick)*0.3)).toFixed(1),unit:"°C",color:ST.amber},
            {label:"Battery",     value:status.batteryLevel,unit:"%",   color:ST.green},
            {label:"Self Node",   value:status.selfId,unit:"",          color:ST.dark},
          ].map(s=>(
            <Card key={s.label} style={{flex:1,padding:"12px 16px"}}>
              <div style={{color:ST.light,fontSize:10,fontWeight:700,letterSpacing:1.2,marginBottom:6,textTransform:"uppercase"}}>{s.label}</div>
              <div style={{color:s.color,fontSize:22,fontWeight:700}}>
                {s.value}<span style={{fontSize:12,marginLeft:2}}>{s.unit}</span>
              </div>
            </Card>
          ))}
        </div>

        {/* Canvas */}
        <div style={{flex:1,margin:"14px 20px 0",background:"#F8F9FA",border:`1px solid ${ST.border}`,borderRadius:4,overflow:"hidden",position:"relative",minHeight:300}}>
          <TopologyCanvas nodes={status.nodeInfos} linkQuality={status.linkQuality} selfId={status.selfId}/>
          {/* Legend */}
          <div style={{position:"absolute",bottom:14,right:14,background:"rgba(255,255,255,0.94)",border:`1px solid ${ST.border}`,borderRadius:4,padding:"10px 14px"}}>
            <div style={{color:ST.mid,fontSize:9,fontWeight:700,letterSpacing:1.5,marginBottom:8}}>LINK QUALITY</div>
            {[["Excellent (25+)",ST.red],["Good (15–25)",ST.green],["Fair (5–15)",ST.amber],["No Link",ST.muted]].map(([l,c])=>(
              <div key={l} style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                <div style={{width:22,height:2.5,background:c}}/>
                <span style={{color:ST.mid,fontSize:10}}>{l}</span>
              </div>
            ))}
          </div>
          {/* Self badge */}
          <div style={{position:"absolute",top:12,left:12,background:"rgba(255,255,255,0.94)",border:`1px solid ${ST.border}`,borderRadius:4,padding:"5px 12px"}}>
            <span style={{color:ST.red,fontSize:10,fontWeight:700}}>◉ Self = Node {status.selfId}</span>
          </div>
        </div>

        {/* TX Delay */}
        <div style={{display:"flex",gap:10,padding:"12px 20px 16px",flexShrink:0,alignItems:"center",flexWrap:"wrap"}}>
          <span style={{color:ST.light,fontSize:10,fontWeight:700,letterSpacing:1,textTransform:"uppercase"}}>TX Delay:</span>
          {status.transmissionDelay.map(d=>(
            <div key={d.id} style={{background:ST.white,border:`1px solid ${ST.border}`,borderRadius:3,padding:"5px 14px",display:"flex",gap:10,alignItems:"center"}}>
              <span style={{color:ST.mid,fontSize:11}}>Node {d.id}</span>
              <span style={{color:ST.dark,fontSize:11,fontWeight:700}}>{d.delay*10} ns</span>
              <span style={{color:ST.light,fontSize:10}}>{((d.delay/100000000)*299792.458).toFixed(2)} km</span>
            </div>
          ))}
        </div>
      </div>
    );

    if(activeNav==="topology-link") return(
      <div style={{height:"100%",background:"#F8F9FA"}}>
        <TopologyCanvas nodes={status.nodeInfos} linkQuality={status.linkQuality} selfId={status.selfId}/>
      </div>
    );
    if(activeNav==="topology-table") return <LinkTable nodes={status.nodeInfos} linkQuality={status.linkQuality}/>;
    if(activeNav==="rf")             return <RFPanel config={config}/>;
    if(activeNav==="device-about")   return <DevicePanel info={MOCK_DEVICE_INFO}/>;
    if(activeNav==="network-basic")  return <SettingsPanel config={config}/>;

    const labels={"network-global":"Global Settings","network-advance":"Advanced Config","network-rf":"RF Settings","network-data":"Data Settings","network-uart":"UART Configuration","network-audio":"Audio Settings","network-gps":"GPS Settings","security-encryption":"Encryption","security-login":"Login Settings","device-update":"Firmware Update"};
    return(
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100%"}}>
        <div style={{width:44,height:44,border:`2px solid ${ST.border}`,borderRadius:"50%",marginBottom:16,display:"flex",alignItems:"center",justifyContent:"center"}}>
          <div style={{width:16,height:16,background:ST.border,borderRadius:"50%"}}/>
        </div>
        <div style={{fontSize:13,fontWeight:700,color:ST.mid,letterSpacing:1}}>{(labels[activeNav]??activeNav).toUpperCase()}</div>
        <div style={{fontSize:11,color:ST.muted,marginTop:6}}>Panel available in full deployment</div>
      </div>
    );
  };

  return(
    <div style={{display:"flex",flexDirection:"column",height:"100vh",background:ST.bg,color:ST.dark,fontFamily:"Arial,sans-serif"}}>

      {/* ── TOP BAR (ST red) */}
      <div style={{height:52,flexShrink:0,background:ST.red,display:"flex",alignItems:"center",padding:"0 20px",gap:6,boxShadow:"0 2px 8px rgba(227,6,19,0.35)"}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginRight:16,flexShrink:0}}>
          <div style={{width:28,height:28,background:"rgba(255,255,255,0.22)",borderRadius:2,display:"flex",alignItems:"center",justifyContent:"center"}}>
            <span style={{color:"#fff",fontSize:12,fontWeight:900}}>ST</span>
          </div>
          <span style={{color:"#fff",fontWeight:700,fontSize:12,letterSpacing:1.5}}>ST ENGINEERING · ACE6 MESH</span>
        </div>

        {chips.map(c=>(
          <div key={c.label} style={{display:"flex",alignItems:"center",gap:7,padding:"4px 12px",borderRadius:20,background:"rgba(255,255,255,0.18)",flexShrink:0}}>
            <span style={{color:"rgba(255,255,255,0.65)",fontSize:9,fontWeight:700,letterSpacing:1.5}}>{c.label}</span>
            <span style={{color:"#fff",fontSize:11,fontWeight:700}}>{c.value}</span>
          </div>
        ))}

        <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:7,flexShrink:0}}>
          <div style={{width:7,height:7,borderRadius:"50%",background:"#fff",animation:"pulse 2s infinite"}}/>
          <span style={{color:"rgba(255,255,255,0.85)",fontSize:10,fontWeight:700,letterSpacing:1.5}}>LIVE</span>
        </div>
      </div>

      {/* ── BODY */}
      <div style={{flex:1,display:"flex",overflow:"hidden"}}>

        {/* ── SIDEBAR (ST dark #404040) */}
        <div style={{width:196,flexShrink:0,background:ST.dark,display:"flex",flexDirection:"column",overflowY:"auto"}}>
          <div style={{padding:"18px 18px 8px",color:"rgba(255,255,255,0.28)",fontSize:9,fontWeight:700,letterSpacing:2}}>NAVIGATION</div>

          {NAV.map(item=>(
            <div key={item.id}>
              <button
                onClick={()=>{if(item.children.length>0)toggle(item.id);setActiveNav(item.id);}}
                style={{width:"100%",textAlign:"left",padding:"10px 18px",background:activeNav===item.id?"rgba(227,6,19,0.28)":"transparent",border:"none",borderLeft:activeNav===item.id?`3px solid ${ST.red}`:"3px solid transparent",color:activeNav===item.id?"#fff":"rgba(255,255,255,0.52)",cursor:"pointer",fontSize:12,fontWeight:activeNav===item.id?700:400,display:"flex",alignItems:"center",gap:10}}
              >
                {item.label}
                {item.children.length>0&&<span style={{marginLeft:"auto",fontSize:9}}>{expanded[item.id]?"▾":"▸"}</span>}
              </button>
              {item.children.length>0&&expanded[item.id]&&item.children.map(child=>(
                <button key={child.id} onClick={()=>setActiveNav(child.id)}
                  style={{width:"100%",textAlign:"left",padding:"7px 18px 7px 36px",background:activeNav===child.id?"rgba(227,6,19,0.2)":"transparent",border:"none",borderLeft:activeNav===child.id?`3px solid ${ST.red}`:"3px solid transparent",color:activeNav===child.id?"#fff":"rgba(255,255,255,0.38)",cursor:"pointer",fontSize:11,fontWeight:activeNav===child.id?600:400}}
                >{child.label}</button>
              ))}
            </div>
          ))}

          <div style={{marginTop:"auto",padding:14}}>
            <button style={{width:"100%",padding:9,background:"transparent",border:"1px solid rgba(255,255,255,0.18)",borderRadius:3,color:"rgba(255,255,255,0.38)",cursor:"pointer",fontSize:11}}>
              Logout
            </button>
          </div>
        </div>

        {/* ── CONTENT */}
        <div style={{flex:1,overflow:"auto"}}>{renderContent()}</div>
      </div>

      <style>{`
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}
        ::-webkit-scrollbar{width:4px;height:4px}
        ::-webkit-scrollbar-track{background:${ST.bg}}
        ::-webkit-scrollbar-thumb{background:${ST.border};border-radius:2px}
        button:focus{outline:none}
        select option{background:#fff;color:${ST.dark}}
      `}</style>
    </div>
  );
}
