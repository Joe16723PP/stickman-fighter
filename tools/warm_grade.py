# tools/warm_grade.py  (python3, pip install pillow numpy)
import glob,os,numpy as np
from PIL import Image
RAMP=[(0.00,'#1A1210'),(0.18,'#3A2418'),(0.40,'#74431F'),(0.62,'#B86E32'),(0.82,'#E8A552'),(1.00,'#FFE0A0')]
hx=lambda h: np.array([int(h[i:i+2],16) for i in (1,3,5)],float)
xs=np.array([p for p,_ in RAMP]); cs=np.stack([hx(c) for _,c in RAMP])
gmap=lambda L: np.stack([np.interp(L,xs,cs[:,k]) for k in range(3)],-1)
def grade(path,ground):
    src=Image.open(path); a=np.asarray(src.convert('RGB'),float)
    L=(0.299*a[...,0]+0.587*a[...,1]+0.114*a[...,2])/255
    m=L.mean(); dark=m<0.22
    Lw=np.clip(L**(0.78 if dark else 1.0)*(1.20 if dark else 1.0),0,1)
    out=0.80*gmap(Lw)+0.20*np.clip(a*(1.15 if dark else 1.0),0,255)
    y=np.arange(a.shape[0])[:,None]/a.shape[0]
    gm=np.clip((y-ground)/0.06,0,1)[...,None]
    lane=(0.55*out+0.45*out.mean(-1,keepdims=True))*0.82
    out=out*(1-gm)+lane*gm
    im=Image.fromarray(np.clip(out,0,255).astype(np.uint8))
    if 'A' in src.mode: im.putalpha(src.getchannel('A'))
    im.save(path,'WEBP',quality=88,method=6)
for f in sorted(glob.glob('assets/backgrounds/*.webp')):
    grade(f, 2 if os.path.basename(f)=='main-menu.webp' else 0.58)
