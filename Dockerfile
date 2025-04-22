# Dockerfile
# Use the official NGINX image to serve static content
FROM nginx:alpine

# Remove default nginx website
RUN rm -rf /usr/share/nginx/html/*

# Copy the application files
# Assumes your project has a 'src' directory containing index.html, Data.csv, js/, css/, etc.
COPY src/ /usr/share/nginx/html/

# Expose port 80
EXPOSE 80

# Start NGINX when the container launches
CMD ["nginx", "-g", "daemon off;"]

