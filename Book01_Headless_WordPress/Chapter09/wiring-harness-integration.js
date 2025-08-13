// inside wiring-harness.js
this.views.forEach(cfg => {
  new ViewHandler(cfg).render();
});