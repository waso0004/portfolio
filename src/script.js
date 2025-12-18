let path = document.querySelector(".path");

const start = "M 0 100 V 50 Q 50 0 100 50 V 100 z";
const end = "M 0 100 V 0 Q 50 0 100 0 V 100 z";

let tl = gsap.timeline()

tl.to(path, {morphSVG: start, ease: "power2.in"})
.to(path,{morphSVG: end, ease: "power2.out"}).reverse()

document.body.addEventListener("click", (e) => {
  tl.reversed(!tl.reversed())
})