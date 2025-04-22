// src/js/main.js

document.addEventListener('DOMContentLoaded', () => {
    let rawData = [];
    let fullData = { nodes: [], links: [] };
    let graphData = { nodes: [], links: [] };
    let selectedEntity = null;
  
    // D3 selections
    const displayModeSelect = d3.select('#display-mode');
    const productModeSelect = d3.select('#product-display-mode');
    const hsLevelSelect = d3.select('#hs-code-level');
    const thresholdInput = d3.select('#filter-threshold');
    const searchInput = d3.select('#search-term');
    const clearBtn = d3.select('#clear-selection-btn');
    const selMsg = d3.select('#selection-message');
    const loading = d3.select('#loading-indicator');
    const errorDisp = d3.select('#error-display');
    const vizCont = d3.select('#visualization-container');
    const svg = d3.select('#visualization');
  
    // Node colors
    const nodeColors = {
      country: '#F79767',
      supplier: '#8DCC93',
      product: '#C990C0',
      importer: '#4C8EDA'
    };
  
    // Auto-load data on startup
    loadData();
  
    // Event bindings for controls
    displayModeSelect.on('change', () => rawData.length && rebuild());
    productModeSelect.on('change', () => { updateUI(); rawData.length && rebuild(); });
    hsLevelSelect.on('change', () => rawData.length && rebuild());
    thresholdInput.on('change', () => rawData.length && rebuild());
    searchInput.on('input', () => { applyFilter(); render(); });
    clearBtn.on('click', () => {
      selectedEntity = null;
      searchInput.property('value', '');
      clearBtn.classed('hidden', true);
      selMsg.classed('hidden', true);
      applyFilter();
      render();
    });
  
    updateUI();
  
    function updateUI() {
      const mode = productModeSelect.node().value;
      hsLevelSelect.style('display', mode === 'hsCode' ? 'block' : 'none');
    }
  
    function showLoading(msg) {
      loading.select('p').text(msg || 'Loading…');
      loading.classed('hidden', false);
      errorDisp.classed('hidden', true);
      vizCont.classed('hidden', true);
    }
  
    function showError(msg) {
      errorDisp.select('p').text(msg);
      errorDisp.classed('hidden', false);
      loading.classed('hidden', true);
      vizCont.classed('hidden', true);
    }
  
    function showViz() {
      vizCont.classed('hidden', false);
      loading.classed('hidden', true);
      errorDisp.classed('hidden', true);
    }
  
    function loadData() {
      showLoading('Loading Data.csv…');
      fetch('Data.csv')
        .then(res => { if (!res.ok) throw new Error(res.statusText); return res.text(); })
        .then(text => Papa.parse(text, {
          header: true,
          skipEmptyLines: true,
          dynamicTyping: true,
          complete: results => {
            rawData = results.data;
            rebuild();
          },
          error: err => showError('Parse error: ' + err.message)
        }))
        .catch(err => showError('Load error: ' + err.message));
    }
  
    function rebuild() {
      const nMap = new Map();
      const lMap = new Map();
      const cfg = {
        mode: displayModeSelect.node().value,
        prod: productModeSelect.node().value,
        level: hsLevelSelect.node().value,
        minTx: +thresholdInput.node().value
      };
  
      function normalize(v, type) {
        if (!v) return '';
        let s = String(v).trim().replace(/\s+/g, ' ');
        if (type !== 'country') {
          s = s.toUpperCase()
            .replace(/\b(CO LTD|LTD|LLC|INC|GMBH|CORPORATION|CORP|PVT|PRIVATE|LIMITED)\b/g, '')
            .replace(/[.,&\-\/\\()]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
          if (s.includes('SUZLON')) s = 'SUZLON';
          if (s.includes('INOX WIND')) s = 'INOX WIND';
          if (s.includes('ENVISION')) s = 'ENVISION';
        }
        return s;
      }
  
      function addNode(id, name, type, orig) {
        if (!nMap.has(id)) {
          nMap.set(id, { id, name, type, originalNames: new Set([orig]), transactions: 0, value: 0, neighbors: new Set() });
        } else {
          nMap.get(id).originalNames.add(orig);
        }
        return nMap.get(id);
      }
  
      function addLink(src, tgt, val) {
        const key = `${src}->${tgt}`;
        if (!lMap.has(key)) {
          lMap.set(key, { source: src, target: tgt, transactions: 0, value: 0 });
        }
        const link = lMap.get(key);
        link.transactions++;
        link.value += val;
        nMap.get(src).neighbors.add(tgt);
        nMap.get(tgt).neighbors.add(src);
      }
  
      rawData.forEach(row => {
        const co = row['Foreign Country'];
        const so = row['Supplier Name'];
        const io = row['Importer Name'];
        if (!co || !so || !io) return;
  
        const hs = row['HS Code '];
        const pn = row['Product Name'];
  
        const country = normalize(co, 'country');
        const supplier = normalize(so, 'supplier');
        const importer = normalize(io, 'importer');
  
        const cid = `country-${country}`;
        const sid = `supplier-${supplier}`;
        const iid = `importer-${importer}`;
  
        let prod = '', pid = '', porig = '';
        if (cfg.prod === 'hsCode') {
          if (!hs) return;
          porig = String(hs).trim();
          const code = porig;
          prod = cfg.level === 'category' && code.length >= 2
            ? `HS ${code.slice(0,2)}xx`
            : cfg.level === 'subcategory' && code.length >= 4
            ? `HS ${code.slice(0,4)}xx`
            : `HS ${code}`;
          pid = `product-${prod}`;
        } else {
          if (!pn) return;
          porig = pn;
          const nameNorm = normalize(pn, 'product');
          prod = nameNorm.length > 30 ? `${nameNorm.slice(0,27)}...` : nameNorm;
          const hash = Math.abs([...nameNorm].reduce((h,c) => (h<<5)-h + c.charCodeAt(0),0))
            .toString(16).slice(0,8);
          pid = `product-name-${hash}`;
        }
  
        const value = parseFloat(row['CIF Value (USD)']) || 0;
  
        [[cid,country,'country',co],[sid,supplier,'supplier',so],[pid,prod,'product',porig],[iid,importer,'importer',io]]
          .forEach(([id,nm,tp,org]) => {
            const node = addNode(id,nm,tp,org);
            node.transactions++;
            node.value += value;
          });
  
        const m = cfg.mode;
        if (m === 'full') {
          addLink(cid,sid,value);
          addLink(sid,pid,value);
          addLink(pid,iid,value);
        } else if (m==='country-supplier') addLink(cid,sid,value);
        else if (m==='supplier-product') addLink(sid,pid,value);
        else if (m==='product-importer') addLink(pid,iid,value);
        else if (m==='country-product') addLink(cid,pid,value);
        else if (m==='supplier-importer') addLink(sid,iid,value);
      });
  
      fullData = {
        nodes: [...nMap.values()].map(n => ({
          id: n.id,
          name: n.name,
          type: n.type,
          originalNames: [...n.originalNames],
          transactions: n.transactions,
          value: n.value,
          neighbors: [...n.neighbors]
        })),
        links: [...lMap.values()]
      };
  
      applyFilter();
      render();
    }
  
    function applyFilter() {
      const nodes = fullData.nodes;
      const links = fullData.links;
      const term = searchInput.node().value.trim().toLowerCase();
  
      let focus = selectedEntity;
      if (term) {
        const match = nodes.find(n =>
          n.name.toLowerCase().includes(term) || n.originalNames.some(o => o.toLowerCase().includes(term))
        );
        if (match) {
          focus = match.id;
          selectedEntity = match.id;
          clearBtn.classed('hidden', false);
          selMsg.classed('hidden', false);
        }
      }
  
      if (!focus) {
        graphData = { nodes:[...nodes], links:[...links] };
        return;
      }
  
      // show only focus and direct neighbors
      const neighborIds = new Set([focus]);
      links.forEach(l => {
        if (l.source === focus) neighborIds.add(l.target);
        if (l.target === focus) neighborIds.add(l.source);
      });
  
      graphData = {
        nodes: nodes.filter(n => neighborIds.has(n.id)),
        links: links.filter(l => l.source===focus || l.target===focus)
      };
    }
  
    function render() {
      if (!graphData.nodes.length) return showError('No data to display');
      showViz();
      svg.selectAll('*').remove();
  
      const W = vizCont.node().clientWidth;
      const H = vizCont.node().clientHeight;
      const g = svg.append('g');
      svg.call(d3.zoom().scaleExtent([0.1,4]).on('zoom', e => g.attr('transform', e.transform)));
  
      const defs = svg.append('defs');
      ['arrow','highlight'].forEach(id => {
        const color = id==='highlight'? '#f03b20':'#999';
        defs.append('marker')
          .attr('id', id)
          .attr('viewBox','0 -5 10 10')
          .attr('refX',20).attr('refY',0)
          .attr('markerWidth',6).attr('markerHeight',6)
          .attr('orient','auto')
          .append('path')
          .attr('d','M0,-5L10,0L0,5')
          .attr('fill', color);
      });
  
      const byId = {};
      fullData.nodes.forEach(n=>byId[n.id]=n);
      const simLinks = graphData.links.map(l=>({
        source: byId[l.source],
        target: byId[l.target],
        transactions: l.transactions
      }));
  
      function initX(n) {
        if (displayModeSelect.node().value==='full') {
          if (n.type==='country') return W*0.2;
          if (n.type==='supplier') return W*0.4;
          if (n.type==='product') return W*0.6;
          if (n.type==='importer') return W*0.8;
        }
        return W/2;
      }
      graphData.nodes.forEach(n=>{ n.x=initX(n); n.y=H/2+(Math.random()-0.5)*H*0.5; });
  
      const sim = d3.forceSimulation(graphData.nodes)
        .force('link',d3.forceLink(simLinks).id(d=>d.id).distance(100))
        .force('charge',d3.forceManyBody().strength(-400))
        .force('x',d3.forceX().x(initX).strength(0.3))
        .force('y',d3.forceY(H/2).strength(0.1))
        .force('collide',d3.forceCollide().radius(d=>Math.sqrt(d.transactions)+10));
  
      // Draw links
      g.append('g').selectAll('path').data(simLinks).enter().append('path')
        .attr('stroke',d=> selectedEntity && (d.source.id===selectedEntity||d.target.id===selectedEntity)? '#f03b20':'#999')
        .attr('stroke-width',d=>Math.max(1,Math.log(d.transactions)*0.5))
        .attr('stroke-opacity',d=> selectedEntity?((d.source.id===selectedEntity||d.target.id===selectedEntity)?1:0.3):0.6)
        .attr('fill','none')
        .attr('marker-end',d=> selectedEntity&&(d.source.id===selectedEntity||d.target.id===selectedEntity)? 'url(#highlight)':'url(#arrow)');
  
      // Link labels
      g.append('g').selectAll('text').data(simLinks).enter().append('text')
        .attr('class','link-label')
        .attr('dy',-5)
        .text(d=>d.transactions)
        .attr('opacity',d=> selectedEntity?((d.source.id===selectedEntity||d.target.id===selectedEntity)?1:0.3):0.7);
  
      // Draw nodes
      const nodesG = g.append('g').selectAll('g').data(graphData.nodes).enter().append('g')
        .on('click',(e,d)=>{
          e.stopPropagation();
          selectedEntity = selectedEntity===d.id? null:d.id;
          clearBtn.classed('hidden', !selectedEntity);
          selMsg.classed('hidden', !selectedEntity);
          applyFilter(); render();
        })
        .call(d3.drag()
          .on('start', dragStart)
          .on('drag', dragging)
          .on('end', dragEnd)
        );
  
      nodesG.append('circle')
        .attr('r',d=>Math.max(6,Math.sqrt(d.transactions)*0.6))
        .attr('fill',d=>nodeColors[d.type])
        .attr('stroke',d=>selectedEntity===d.id?'#f03b20':'#fff')
        .attr('stroke-width',d=>selectedEntity===d.id?3:1.5)
        .attr('opacity',d=>selectedEntity?((d.id===selectedEntity||d.neighbors.includes(selectedEntity))?1:0.3):1);
  
      nodesG.append('text')
        .attr('class','node-count')
        .attr('dy','.3em')
        .text(d=>d.transactions);
  
      nodesG.append('text')
        .attr('class','node-label')
        .attr('dx',d=>Math.max(6,Math.sqrt(d.transactions)*0.6)+5)
        .attr('dy','.35em')
        .text(d=>d.name.length>15? d.name.slice(0,12)+'...':d.name)
        .attr('opacity',d=>selectedEntity?((d.id===selectedEntity||d.neighbors.includes(selectedEntity))?1:0.3):1);
  
      sim.on('tick',()=>{
        g.selectAll('path')
          .attr('d',d=>{const dx=d.target.x-d.source.x,dy=d.target.y-d.source.y,dr=Math.sqrt(dx*dx+dy*dy)*1.2;return `M${d.source.x},${d.source.y}A${dr},${dr} 0 0,1 ${d.target.x},${d.target.y}`;});
        g.selectAll('.link-label')
          .attr('x',d=>(d.source.x+d.target.x)/2)
          .attr('y',d=>(d.source.y+d.target.y)/2);
        nodesG.attr('transform',d=>`translate(${d.x},${d.y})`);
      });
  
      svg.on('click',()=>{selectedEntity=null;clearBtn.classed('hidden',true);selMsg.classed('hidden',true);applyFilter();render();});
  
      function dragStart(event,d){if(!event.active) sim.alphaTarget(0.3).restart();d.fx=d.x;d.fy=d.y;}
      function dragging(event,d){d.fx=event.x;d.fy=event.y;}
      function dragEnd(event,d){if(!event.active) sim.alphaTarget(0);d.fx=null;d.fy=null;}
    }
  });
  