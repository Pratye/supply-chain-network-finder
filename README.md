# Supply Chain Network Visualization

**Live Preview:** [https://supply-chain-graph.onrender.com](https://supply-chain-graph.onrender.com)

This interactive web application provides a Neo4j-style visualization of global trade flows, enabling users to explore the relationships between countries, suppliers, products, and importers through an intuitive force-directed graph.

## Key Features

- **Automatic Data Loading**  
  On page load, the application fetches and parses `Data.csv`, eliminating the need for manual uploads.

- **Live Preview**  
  Access a deployed demo at the URL above to explore real-time data without local setup.

- **Dynamic Filters**  
  - **Display Mode:** Choose between full chain view (Country → Supplier → Product → Importer) or any of the six partial linkages (e.g., Country → Supplier, Supplier → Product, etc.)  
  - **Product Mapping:** Group products into major categories (e.g., Gearbox, Seal, Cable) or aggregate by HS codes at the 2-digit or 4-digit level.  
  - **Transaction Threshold:** Hide links with fewer than *n* transactions to focus on significant trade relationships.

- **Country Normalization**  
  Variants of country names (e.g., “GERMANY,” “GERMA,” “GERM”) are mapped to standardized labels (e.g., “Germany”) for clear, consolidated nodes.

- **Product Categorization**  
  Unify disparate product names into a small set of core categories, reducing node clutter and highlighting key trade items.

- **Search & Highlight**  
  - **Search Entities:** Type a country, supplier, importer, or product category to isolate that node and its direct trade partners.  
  - **Click-to-Focus:** Click any node to highlight its direct neighbors; click the background or “Clear” button to reset the view.

- **Responsive & Interactive**  
  - **Zoom & Pan:** Scroll to zoom and drag to reposition the graph.  
  - **Force Layout:** Neo4j-inspired curved links and size-scaled nodes based on transaction volume.  

## Getting Started

1. **Install dependencies**  
   This is a static site; no build step is required. Ensure you have a local HTTP server (e.g., `python3 -m http.server 3000`).

2. **Run the server**  
   ```bash
   cd src/
   python3 -m http.server 3000
   ```

3. **Open in Browser**  
   Visit `http://localhost:3000` to view the interactive network.

4. **Data Requirements**  
   Place your CSV file at `src/Data.csv`. It must include the following columns (case-sensitive):  
   - `Foreign Country`  
   - `Supplier Name`  
   - `Importer Name`  
   - `HS Code `  
   - `Product Name`  
   - `CIF Value (USD)`  

## File Structure

```
my-supply-chain-app/
├── src/
│   ├── index.html         # Main HTML
│   ├── Data.csv           # Trade data file
│   ├── js/
│   │   └── main.js        # D3 and filtering logic
│   └── css/
│       └── styles.css     # Custom styles
└── README.md              # This documentation
```

## Customization

- **Add Countries**: Extend the `countryMapping` object in `main.js` for additional aliases.
- **Modify Product Categories**: Update the `productCategoryMapping` array to include new keywords and labels.
- **Styling**: Tailwind CSS is used for layout; feel free to override with `styles.css`.

## License

This project is provided under the MIT License.

