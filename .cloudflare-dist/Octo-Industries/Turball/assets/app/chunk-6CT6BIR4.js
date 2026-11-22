function o(n){let e=document.querySelector('meta[name="content-base"]')?.content||"/content/",t=new URL(e.endsWith("/")?e:e+"/",location.href);return new URL(n,t).href}export{o as a};
