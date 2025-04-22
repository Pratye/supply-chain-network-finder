import React, { useState, useEffect, useRef } from 'react';
import * as d3 from 'd3';

// Component for the legend items
function LegendItem({ colorClass, label }) {
  return (
    <div className="flex items-center space-x-2">
      <span className={`w-3 h-3 rounded-full ${colorClass}`} />
      <span className="text-xs text-gray-600">{label}</span>
    </div>
  );
}

const TradeNetworkGraph = () => {
  const svgRef = useRef(null);
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filterThreshold, setFilterThreshold] = useState(20);
  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  const [searchTerm, setSearchTerm] = useState('');
  const [displayMode, setDisplayMode] = useState('full');
  const [hsCodeLevel, setHsCodeLevel] = useState('category');
  const [selectedEntity, setSelectedEntity] = useState(null);
  const [productDisplayMode, setProductDisplayMode] = useState('hsCode'); // 'hsCode' or 'productName'
  const [isSidebarCollapsed, setSidebarCollapsed] = useState(false);
  
  // Neo4j style colors
  const nodeColors = {
    country: '#F97316',  // Orange (tailwind orange-500)
    supplier: '#22C55E',  // Green (tailwind green-500)
    product: '#A855F7',   // Purple (tailwind purple-500)
    importer: '#6366F1'   // Indigo (tailwind indigo-500)
  };

  // Load CSV data
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        const res = await fetch('/Data.csv');
        if (!res.ok) throw new Error('Network response was not ok');
        const fileData = await res.text();

        const Papa = await import('papaparse');
        
        const parsedData = Papa.default.parse(fileData, {
          header: true,
          skipEmptyLines: true,
          dynamicTyping: true
        });
        
        setData(parsedData.data);
        setLoading(false);
      } catch (err) {
        console.error("Error loading or parsing data:", err);
        setError("Failed to load data");
        setLoading(false);
      }
    };
    
    loadData();
  }, []);

  // Process data when settings change
  useEffect(() => {
    if (data.length > 0) {
      processData();
    }
  }, [data, filterThreshold, displayMode, hsCodeLevel, productDisplayMode]);

  // Normalize entity names
  const normalizeEntity = (name, type) => {
    if (!name) return '';
    
    // Convert to string if needed
    if (typeof name !== 'string') name = String(name);
    
    // Basic normalization (remove line breaks and extra spaces)
    let normalized = name.trim().replace(/\n/g, ' ').replace(/\s+/g, ' ');
    
    // Company name normalization
    if (type === 'supplier' || type === 'importer') {
      // Convert to uppercase
      normalized = normalized.toUpperCase();
      
      // Remove common company suffixes
      normalized = normalized
        .replace(/\b(CO LTD|LTD|LLC|INC|GMBH|CORPORATION|CORP|PVT|PRIVATE|LIMITED)\b/g, '')
        .replace(/[.,&\-\/\\()]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      
      // Special case normalizations
      if (normalized.includes('SUZLON')) {
        normalized = 'SUZLON';
      } else if (normalized.includes('INOX WIND')) {
        normalized = 'INOX WIND';
      } else if (normalized.includes('ENVISION')) {
        normalized = 'ENVISION';
      }
    }
    
    return normalized;
  };

  // Process data to build the graph
  const processData = () => {
    const nodeMap = new Map();
    const linkMap = new Map();
    const relationshipMap = new Map();
    
    // Helper function to add or get a node
    const getNode = (id, name, type, originalName) => {
      if (!nodeMap.has(id)) {
        nodeMap.set(id, {
          id,
          name,
          type, 
          originalNames: new Set([originalName]),
          transactions: 0,
          value: 0,
          relatedNodes: new Set()
        });
      } else {
        nodeMap.get(id).originalNames.add(originalName);
      }
      
      return nodeMap.get(id);
    };
    
    // Helper function to add or update a link
    const addLink = (sourceId, targetId, value) => {
      const linkId = `${sourceId}->${targetId}`;
      
      if (!linkMap.has(linkId)) {
        linkMap.set(linkId, {
          id: linkId,
          source: sourceId,
          target: targetId,
          transactions: 0,
          value: 0
        });
      }
      
      const link = linkMap.get(linkId);
      link.transactions += 1;
      link.value += value || 0;
      
      // Track relationships
      const sourceNode = nodeMap.get(sourceId);
      const targetNode = nodeMap.get(targetId);
      
      if (sourceNode && targetNode) {
        sourceNode.relatedNodes.add(targetId);
        targetNode.relatedNodes.add(sourceId);
      }
    };
    
    // Process each row
    data.forEach(row => {
      // Get and normalize entities
      const countryOriginal = row["Foreign Country"];
      const supplierOriginal = row["Supplier Name"];
      const importerOriginal = row["Importer Name"];
      const hsCodeOriginal = row["HS Code "];
      const productNameOriginal = row["Product Name"];
      
      // Skip incomplete data
      if (!countryOriginal || !supplierOriginal || !importerOriginal) {
        return;
      }
      
      // Normalize entity names
      const country = normalizeEntity(countryOriginal, 'country');
      const supplier = normalizeEntity(supplierOriginal, 'supplier');
      const importer = normalizeEntity(importerOriginal, 'importer');
      
      // Create unique IDs for country, supplier, importer
      const countryId = `country-${country}`;
      const supplierId = `supplier-${supplier}`;
      const importerId = `importer-${importer}`;
      
      let product = '';
      let productId = '';
      let productOriginal = '';
      
      // Process product based on display mode
      if (productDisplayMode === 'hsCode') {
        // Use HS code
        if (!hsCodeOriginal) return;
        
        const hsCode = String(hsCodeOriginal).trim();
        productOriginal = hsCodeOriginal;
        
        if (hsCodeLevel === 'category' && hsCode.length >= 2) {
          const category = hsCode.substring(0, 2);
          product = `HS ${category}xx`;
        } else if (hsCodeLevel === 'subcategory' && hsCode.length >= 4) {
          const subcategory = hsCode.substring(0, 4);
          product = `HS ${subcategory}xx`;
        } else {
          product = `HS ${hsCode}`;
        }
        
        productId = `product-${product}`;
      } else {
        // Use product name
        if (!productNameOriginal) return;
        
        const normalizedProduct = normalizeEntity(productNameOriginal, 'product');
        productOriginal = productNameOriginal;
        
        // Truncate if too long
        product = normalizedProduct.length > 30 
          ? normalizedProduct.substring(0, 27) + '...' 
          : normalizedProduct;
        
        // Use a more specific ID to avoid collisions
        productId = `product-name-${normalizedProduct.substring(0, 20)}`;
      }
      
      // Create or get nodes
      const countryNode = getNode(countryId, country, 'country', countryOriginal);
      const supplierNode = getNode(supplierId, supplier, 'supplier', supplierOriginal);
      const productNode = getNode(productId, product, 'product', productOriginal);
      const importerNode = getNode(importerId, importer, 'importer', importerOriginal);
      
      // Get transaction value
      const value = parseFloat(row["CIF Value (USD)"]) || 0;
      
      // Update node statistics
      countryNode.transactions += 1;
      countryNode.value += value;
      
      supplierNode.transactions += 1;
      supplierNode.value += value;
      
      productNode.transactions += 1;
      productNode.value += value;
      
      importerNode.transactions += 1;
      importerNode.value += value;
      
      // Create links based on display mode
      if (displayMode === 'full') {
        // Full chain: country -> supplier -> product -> importer
        addLink(countryId, supplierId, value);
        addLink(supplierId, productId, value);
        addLink(productId, importerId, value);
      } else if (displayMode === 'country-supplier') {
        addLink(countryId, supplierId, value);
      } else if (displayMode === 'supplier-product') {
        addLink(supplierId, productId, value);
      } else if (displayMode === 'product-importer') {
        addLink(productId, importerId, value);
      } else if (displayMode === 'country-product') {
        addLink(countryId, productId, value);
      } else if (displayMode === 'supplier-importer') {
        addLink(supplierId, importerId, value);
      }
    });
    
    // Convert maps to arrays and convert Sets to Arrays
    const nodes = Array.from(nodeMap.values()).map(node => ({
      ...node,
      originalNames: Array.from(node.originalNames),
      relatedNodes: Array.from(node.relatedNodes)
    }));
    
    const links = Array.from(linkMap.values());
    
    // Filter by transaction threshold
    const filteredLinks = links.filter(link => link.transactions >= filterThreshold);
    
    // Keep only nodes with links
    const usedNodeIds = new Set();
    filteredLinks.forEach(link => {
      usedNodeIds.add(link.source);
      usedNodeIds.add(link.target);
    });
    
    const filteredNodes = nodes.filter(node => usedNodeIds.has(node.id));
    
    // Set graph data
    setGraphData({
      nodes: filteredNodes,
      links: filteredLinks
    });
    
    console.log(`Normalized to ${filteredNodes.length} nodes and ${filteredLinks.length} links`);
  };

  // Filter graph data based on search term or selected entity
  const getFilteredGraphData = () => {
    // If we don't have a search term or selected entity, return all data
    if (!searchTerm && !selectedEntity) return graphData;
    
    let filteredNodes = [...graphData.nodes];
    
    // Apply search term filtering
    if (searchTerm) {
      const lowerSearchTerm = searchTerm.toLowerCase();
      
      filteredNodes = graphData.nodes.filter(node => {
        // Check node name
        if (node.name.toLowerCase().includes(lowerSearchTerm)) return true;
        
        // Check original names
        if (node.originalNames && node.originalNames.some(name => 
          String(name).toLowerCase().includes(lowerSearchTerm)
        )) return true;
        
        return false;
      });
      
      // If search matches exactly one node, select it automatically
      if (filteredNodes.length === 1 && !selectedEntity) {
        setSelectedEntity(filteredNodes[0].id);
      }
    }
    
    // If we have a selected entity, expand to include its network
    if (selectedEntity) {
      const selectedNode = graphData.nodes.find(n => n.id === selectedEntity);
      if (selectedNode) {
        // Collect direct relationships
        const relatedNodeIds = new Set([selectedEntity, ...selectedNode.relatedNodes]);
        
        // Union with search results if we had a search term
        filteredNodes = searchTerm 
          ? [...new Set([...filteredNodes, ...graphData.nodes.filter(n => relatedNodeIds.has(n.id))])]
          : graphData.nodes.filter(n => relatedNodeIds.has(n.id));
      }
    }
    
    // Filter links to only those connecting filtered nodes
    const nodeIds = new Set(filteredNodes.map(n => n.id));
    
    const filteredLinks = graphData.links.filter(link =>
      nodeIds.has(link.source) && nodeIds.has(link.target)
    );
    
    return {
      nodes: filteredNodes,
      links: filteredLinks
    };
  };

  // Build visualization
  useEffect(() => {
    if (loading || !graphData.nodes.length || !svgRef.current) return;
    
    const filteredData = getFilteredGraphData();
    const { nodes, links } = filteredData;
    
    // Clear previous visualization
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();
    
    // Get container dimensions
    const width = svgRef.current.clientWidth;
    const height = svgRef.current.clientHeight;
    
    // Create container for zoom/pan
    const g = svg.append("g");
    
    // Add zoom behavior
    const zoom = d3.zoom()
      .scaleExtent([0.1, 4])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
      });
    
    svg.call(zoom);
    
    // Create arrows for directed links
    svg.append("defs").append("marker")
      .attr("id", "arrow")
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 20)
      .attr("refY", 0)
      .attr("markerWidth", 6)
      .attr("markerHeight", 6)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M0,-5L10,0L0,5")
      .attr("fill", "#999");
    
    // Create highlighted arrow marker
    svg.append("defs").append("marker")
      .attr("id", "arrow-highlighted")
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 20)
      .attr("refY", 0)
      .attr("markerWidth", 6)
      .attr("markerHeight", 6)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M0,-5L10,0L0,5")
      .attr("fill", "#f03b20");
    
    // Prepare node and link data for D3
    // We need to convert ID references to object references
    const nodesById = {};
    nodes.forEach(node => {
      nodesById[node.id] = node;
    });
    
    const linksForSimulation = links.map(link => ({
      ...link,
      source: nodesById[link.source] || link.source,
      target: nodesById[link.target] || link.target
    }));
    
    // Define layout positions based on node type
    const getInitialX = (node) => {
      if (displayMode === 'full') {
        if (node.type === 'country') return width * 0.2;
        if (node.type === 'supplier') return width * 0.4;
        if (node.type === 'product') return width * 0.6;
        if (node.type === 'importer') return width * 0.8;
      }
      return width / 2;
    };
    
    // Set initial positions
    nodes.forEach(node => {
      node.x = getInitialX(node);
      node.y = height / 2 + (Math.random() - 0.5) * height * 0.5;
    });
    
    // Create simulation
    const simulation = d3.forceSimulation(nodes)
      .force("link", d3.forceLink(linksForSimulation).id(d => d.id).distance(100))
      .force("charge", d3.forceManyBody().strength(-400))
      .force("x", d3.forceX().x(d => getInitialX(d)).strength(displayMode === 'full' ? 0.3 : 0.1))
      .force("y", d3.forceY(height / 2).strength(0.1))
      .force("collide", d3.forceCollide().radius(d => Math.sqrt(d.transactions) + 10));
    
    // Create curved links - Neo4j style
    const link = g.append("g")
      .attr("class", "links")
      .selectAll("path")
      .data(linksForSimulation)
      .enter().append("path")
      .attr("stroke", d => {
        if (selectedEntity) {
          return (d.source.id === selectedEntity || d.target.id === selectedEntity) ? "#f03b20" : "#999";
        }
        return "#999";
      })
      .attr("stroke-width", d => Math.max(1, Math.log(d.transactions) * 0.5))
      .attr("stroke-opacity", d => {
        if (selectedEntity) {
          return (d.source.id === selectedEntity || d.target.id === selectedEntity) ? 1 : 0.3;
        }
        return 0.6;
      })
      .attr("fill", "none")
      .attr("marker-end", d => {
        if (selectedEntity && (d.source.id === selectedEntity || d.target.id === selectedEntity)) {
          return "url(#arrow-highlighted)";
        }
        return "url(#arrow)";
      });
    
    // Add transaction counts on links
    g.append("g")
      .attr("class", "link-labels")
      .selectAll("text")
      .data(linksForSimulation)
      .enter().append("text")
      .attr("class", "link-label")
      .attr("font-size", 9)
      .attr("dy", -5)
      .attr("text-anchor", "middle")
      .text(d => d.transactions)
      .attr("opacity", d => {
        if (selectedEntity) {
          return (d.source.id === selectedEntity || d.target.id === selectedEntity) ? 1 : 0.3;
        }
        return 0.7;
      });
    
    // Create nodes with Neo4j style
    const node = g.append("g")
      .attr("class", "nodes")
      .selectAll("g")
      .data(nodes)
      .enter().append("g")
      .attr("class", "node")
      .on("click", (event, d) => {
        event.stopPropagation();
        setSelectedEntity(selectedEntity === d.id ? null : d.id);
      })
      .call(drag(simulation));
    
    // Add node circles
    node.append("circle")
      .attr("r", d => Math.max(6, Math.sqrt(d.transactions) * 0.6))
      .attr("fill", d => nodeColors[d.type])
      .attr("stroke", d => {
        if (selectedEntity === d.id) return "#f03b20";
        return "#fff";
      })
      .attr("stroke-width", d => selectedEntity === d.id ? 3 : 1.5)
      .attr("opacity", d => {
        if (selectedEntity && selectedEntity !== d.id) {
          return d.relatedNodes.includes(selectedEntity) ? 0.8 : 0.3;
        }
        return 1;
      });
    
    // Add transaction count inside nodes
    node.append("text")
      .attr("class", "node-count")
      .attr("text-anchor", "middle")
      .attr("dy", ".3em")
      .attr("font-size", 10)
      .attr("fill", "#fff")
      .text(d => d.transactions);
    
    // Add node labels
    node.append("text")
      .attr("class", "node-label")
      .attr("dx", d => Math.max(6, Math.sqrt(d.transactions) * 0.6) + 5)
      .attr("dy", ".35em")
      .attr("font-size", d => selectedEntity === d.id ? 12 : 10)
      .attr("font-weight", d => selectedEntity === d.id ? "bold" : "normal")
      .text(d => {
        // Truncate long names
        const maxLength = 15;
        return d.name.length > maxLength ? d.name.slice(0, maxLength-3) + '...' : d.name;
      })
      .attr("opacity", d => {
        if (selectedEntity && selectedEntity !== d.id) {
          return d.relatedNodes.includes(selectedEntity) ? 0.8 : 0.3;
        }
        return 1;
      });
    
    // Add tooltips
    node.append("title")
      .text(d => {
        let tooltip = `${d.name}\nType: ${d.type}\nTransactions: ${d.transactions}\nValue: $${d.value.toLocaleString()}`;
        
        // Add variations if there are more than one
        if (d.originalNames && d.originalNames.length > 1) {
          tooltip += `\n\nVariations (${d.originalNames.length}):`
          
          // Only show first 5 variations to avoid huge tooltips
          const displayCount = Math.min(d.originalNames.length, 5);
          for (let i = 0; i < displayCount; i++) {
            tooltip += `\n- ${d.originalNames[i]}`;
          }
          
          if (d.originalNames.length > 5) {
            tooltip += `\n- and ${d.originalNames.length - 5} more...`;
          }
        }
        
        return tooltip;
      });
    
    // Update positions on each tick
    simulation.on("tick", () => {
      // Update link paths (curved Neo4j style)
      link.attr("d", d => {
        const dx = d.target.x - d.source.x;
        const dy = d.target.y - d.source.y;
        const dr = Math.sqrt(dx * dx + dy * dy) * 1.2; // Curve factor
        return `M${d.source.x},${d.source.y}A${dr},${dr} 0 0,1 ${d.target.x},${d.target.y}`;
      });
      
      // Update link labels
      g.selectAll(".link-label")
        .attr("x", d => (d.source.x + d.target.x) / 2)
        .attr("y", d => (d.source.y + d.target.y) / 2);
      
      // Update node positions
      node.attr("transform", d => `translate(${d.x},${d.y})`);
    });
    
    // Clear selection when clicking on background
    svg.on("click", () => {
      setSelectedEntity(null);
    });
    
    // Drag functions
    function drag(simulation) {
      function dragstarted(event) {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        event.subject.fx = event.subject.x;
        event.subject.fy = event.subject.y;
      }
      
      function dragged(event) {
        event.subject.fx = event.x;
        event.subject.fy = event.y;
      }
      
      function dragended(event) {
        if (!event.active) simulation.alphaTarget(0);
        event.subject.fx = null;
        event.subject.fy = null;
      }
      
      return d3.drag()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended);
    }
  }, [graphData, searchTerm, loading, displayMode, selectedEntity]);

  // Handle display mode changes
  const handleDisplayModeChange = (e) => {
    const value = e.target.value;
    setDisplayMode(value);
    setSelectedEntity(null);
  };

  // Handle HS code level changes
  const handleHsCodeLevelChange = (e) => {
    const value = e.target.value;
    setHsCodeLevel(value === '2-digit' ? 'category' : 'subcategory');
  };

  // Handle product display mode changes
  const handleProductDisplayModeChange = (e) => {
    const value = e.target.value;
    setProductDisplayMode(value === 'HS Codes' ? 'hsCode' : 'productName');
  };

  // Handle search input
  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
  };

  // Handle filter threshold changes
  const handleThresholdChange = (e) => {
    setFilterThreshold(parseInt(e.target.value) || 1);
  };

  // Toggle sidebar
  const toggleSidebar = () => {
    setSidebarCollapsed(!isSidebarCollapsed);
  };

  return (
    <div className="flex h-screen bg-slate-50 font-sans">
      {/* Toggle sidebar button for mobile */}
      <button 
        className="lg:hidden fixed top-4 left-4 z-20 p-2 rounded-full bg-indigo-600 text-white shadow-lg"
        onClick={toggleSidebar}
      >
        {isSidebarCollapsed ? 
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
          </svg> 
        : 
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        }
      </button>

      {/* ─── SIDEBAR ──────────────────────────────────────────── */}
      <aside className={`${isSidebarCollapsed ? 'hidden' : 'flex'} lg:flex flex-col w-64 lg:w-72 bg-white shadow-md transition-all duration-300 ease-in-out z-10`}>
        <div className="sticky top-0 bg-white z-10 p-4 border-b flex items-center justify-between">
          <h2 className="text-lg font-medium text-gray-800">Controls</h2>
          <button 
            className="hidden lg:block text-gray-500 hover:text-gray-700"
            onClick={toggleSidebar}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M15.707 4.293a1 1 0 010 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 011.414-1.414L10 8.586l4.293-4.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* Display Mode */}
          <div className="bg-white rounded-lg shadow-sm hover:shadow transition-all duration-200 p-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Display Mode
            </label>
            <select 
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
              onChange={handleDisplayModeChange}
              value={displayMode === 'full' ? 'Full Chain' : 
                     displayMode === 'country-supplier' ? 'Country → Supplier' :
                     displayMode === 'supplier-product' ? 'Supplier → Product' : 'Product → Importer'}
            >
              <option value="full">Full Chain</option>
              <option value="country-supplier">Country → Supplier</option>
              <option value="supplier-product">Supplier → Product</option>
              <option value="product-importer">Product → Importer</option>
            </select>
          </div>
          {/* Product Display & HS‑Code Level */}
          <div className="bg-white rounded-lg shadow-sm hover:shadow transition-all duration-200 p-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Product Display & HS‑Code Level
            </label>
            <div className="grid grid-cols-2 gap-3">
              {/* Product Display Mode */}
              <select 
                className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                onChange={handleProductDisplayModeChange}
                value={productDisplayMode === 'hsCode' ? 'HS Codes' : 'Product Names'}
              >
                <option>HS Codes</option>
                <option>Product Names</option>
              </select>

              {/* HS‑Code Granularity */}
              <select 
                className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                onChange={handleHsCodeLevelChange}
                value={hsCodeLevel === 'category' ? '2-digit' : '4-digit'}
              >
                <option value="2-digit">2‑digit (xx)</option>
                <option value="4-digit">4‑digit (xxxx)</option>
              </select>
            </div>
          </div>

          {/* Filter Threshold */}
          <div className="bg-white rounded-lg shadow-sm hover:shadow transition-all duration-200 p-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Min Transactions: {filterThreshold}
            </label>
            <input
              type="range"
              min="1"
              max="100"
              step="1"
              className="w-full"
              value={filterThreshold}
              onChange={handleThresholdChange}
            />
          </div>

          {/* Search */}
          <div className="bg-white rounded-lg shadow-sm hover:shadow transition-all duration-200 p-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Search Entities
            </label>
            <input
              type="text"
              placeholder="Type to search..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
              value={searchTerm}
              onChange={handleSearchChange}
            />
          </div>

          {/* Legend */}
          <div className="bg-white rounded-lg shadow-sm hover:shadow transition-all duration-200 p-4">
            <h3 className="text-sm font-medium text-gray-700 mb-2">Legend</h3>
            <div className="grid grid-cols-2 gap-2">
              <LegendItem colorClass="bg-orange-500" label="Country" />
              <LegendItem colorClass="bg-green-500" label="Supplier" />
              <LegendItem colorClass="bg-purple-500" label="Product" />
              <LegendItem colorClass="bg-indigo-500" label="Importer" />
            </div>
          </div>
        </div>
      </aside>

      {/* ─── MAIN CONTENT ──────────────────────────────────── */}
      <main className="flex-1 p-4 relative">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-75">
            <div className="text-lg font-medium text-gray-700">Loading…</div>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-red-500">{error}</div>
          </div>
        )}
        <svg ref={svgRef} className="w-full h-full" />
      </main>
    </div>
  );
};

export default TradeNetworkGraph;
