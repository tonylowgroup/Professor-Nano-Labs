/* Graphene ballistic transport: the notebook's NEGF engine, unchanged.
   Copied verbatim from BROWSER_ENGINE_JS in graphene_ballistic_transport.ipynb.
   Energies in eV, lengths in nm, k_y in 1/nm. */
// Exact, scalar mode-space NEGF. This is a direct JavaScript translation
// of solve_mode() in the notebook; no fitted or pretabulated transmission.
const GrapheneEngine = (() => {
  function csqrt(x,y) {
    const r=Math.hypot(x,y);
    if (x>=0) { const a=Math.sqrt((r+x)/2); return [a,a===0?0:y/(2*a)]; }
    const b=(y<0?-1:1)*Math.sqrt((r-x)/2);
    return [b===0?0:y/(2*b),b];
  }
  function cdiv(a,b,c,d) { const v=c*c+d*d; return [(a*c+b*d)/v,(b*c-a*d)/v]; }
  function sigma(E,U,t,b,eta) {
    const zr=E-U, zi=eta;
    const cr=zr*zr-zi*zi+b*b-t*t, ci=2*zr*zi;
    const rr=cr*cr-ci*ci-4*b*b*(zr*zr-zi*zi);
    const ri=2*cr*ci-8*b*b*zr*zi;
    const root=csqrt(rr,ri);
    const pr=cr+root[0], pi=ci+root[1], mr=cr-root[0], mi=ci-root[1];
    const big=(Math.hypot(pr,pi)>=Math.hypot(mr,mi))?[pr,pi]:[mr,mi];
    const s1=cdiv(big[0],big[1],2*zr,2*zi), s2=cdiv(b*b,0,s1[0],s1[1]);
    return s1[1]<=s2[1]?s1:s2;
  }
  function geometry(p) {
    const a=1.5*p.carbon_bond_nm;
    const nc=Math.max(1,Math.floor(p.channel_length_nm/a+0.5));
    const ns=Math.max(0,Math.floor(p.buffer_length_nm/a+0.5));
    const n=nc+2*ns, x=new Float64Array(n), U=new Float64Array(2*n);
    for(let j=0;j<n;j++) {
      x[j]=(j-ns+.5)*a;
      const u=j<ns?p.dirac_source_eV:(j<ns+nc?p.dirac_channel_eV:p.dirac_drain_eV);
      U[2*j]=u; U[2*j+1]=u;
    }
    return {a,nc,ns,n,x,U,L:nc*a,xmin:-ns*a,xmax:(nc+ns)*a};
  }
  function hopping(ky,p) {
    return 2*p.hopping_eV*Math.cos(p.valley*Math.PI/3+ky*Math.sqrt(3)*p.carbon_bond_nm/2);
  }
  function open(E,U,t,b) {
    const v=Math.abs(E-U), gap=Math.abs(t-b);
    return (gap<1e-12||v>gap+1e-12)&&v<t+b-1e-12;
  }
  function solve(energies,ky,p,eta,needLDOS=false) {
    const g=geometry(p), n=2*g.n, ne=energies.length, t=p.hopping_eV, b=hopping(ky,p);
    const T=new Float64Array(ne), rho=needLDOS?new Float64Array(ne*g.n):null;
    const leftR=needLDOS?new Float64Array(n):null;
    const leftI=needLDOS?new Float64Array(n):null;
    for(let ie=0;ie<ne;ie++) {
      const E=energies[ie], s=sigma(E,p.dirac_source_eV,t,b,eta);
      const d=sigma(E,p.dirac_drain_eV,t,b,eta);
      let prevR=0,prevI=0,logAmp=0;
      for(let j=0;j<n;j++) {
        let zr=E-g.U[j],zi=eta;
        if(j===0){zr-=s[0];zi-=s[1];}
        if(j===n-1){zr-=d[0];zi-=d[1];}
        const hp=j===0?0:((j-1)%2===0?t:b), h2=hp*hp;
        const dr=zr-h2*prevR,di=zi-h2*prevI,den=dr*dr+di*di;
        prevR=dr/den;prevI=-di/den;
        logAmp-=.5*Math.log(den);
        if(j>0)logAmp+=Math.log(hp);
        if(needLDOS){leftR[j]=prevR;leftI[j]=prevI;}
      }
      const logT=Math.log(Math.max(-2*s[1],1e-300))+Math.log(Math.max(-2*d[1],1e-300))+2*logAmp;
      T[ie]=(open(E,p.dirac_source_eV,t,b)&&open(E,p.dirac_drain_eV,t,b))?
        Math.exp(Math.max(-745,Math.min(700,logT))):0;
      if(needLDOS) {
        let rsr=0,rsi=0;
        for(let j=n-1;j>=0;j--) {
          let zr=E-g.U[j],zi=eta;
          if(j===0){zr-=s[0];zi-=s[1];}
          if(j===n-1){zr-=d[0];zi-=d[1];}
          const hp=j===0?0:((j-1)%2===0?t:b),h2=hp*hp;
          const lr=j>0?h2*leftR[j-1]:0,li=j>0?h2*leftI[j-1]:0;
          const dr=zr-lr-rsr,di=zi-li-rsi,den=dr*dr+di*di;
          rho[ie*g.n+Math.floor(j/2)]+=di/den/Math.PI/g.a;
          const rr=zr-rsr,ri=zi-rsi,rd=rr*rr+ri*ri;
          rsr=h2*rr/rd;rsi=-h2*ri/rd;
        }
      }
    }
    return {T,rho,geometry:g,halfGap:Math.abs(t-b),energies,ky};
  }
  return {sigma,geometry,hopping,open,solve};
})();
if(typeof module!=='undefined')module.exports=GrapheneEngine;
