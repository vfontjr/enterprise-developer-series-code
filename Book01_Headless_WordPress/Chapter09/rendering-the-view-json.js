import ViewHandler from './view-handler.js';

const handler = new ViewHandler({
  viewKey: 'customer-list',
  mountSelector: '#customerView'
});
handler.render();