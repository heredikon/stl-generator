# Slant 3D API Usage Guide

This guide covers how to integrate the Slant 3D API into the Parametric 3D Generator project. The Slant 3D API allows you to turn this application into a manufacturing backend, enabling users to generate 3D models and order them directly for 3D printing.

## Overview

The Slant 3D API is a RESTful web service that provides programmatic access to Slant 3D's large-scale print farms. By using this API, you can:
- **Upload Models:** Send user-generated STL files from our parametric generator directly to Slant 3D.
- **Order Management:** Create and place print orders dynamically.
- **Real-time Tracking:** Use webhooks to track order status (queueing, printing, quality control, shipping).
- **Shipping & Fulfillment:** Handle shipping directly to customers without maintaining your own inventory.

## Getting Started

### 1. Authentication
To use the Slant 3D API, you will need to obtain an API key from the [Slant 3D Developer Portal](https://www.slant3d.com/slant-3d-printing-api).

API requests must be authenticated using a token-based approach. Include your API key in the `Authorization` header of all your HTTP requests:

```http
Authorization: Bearer YOUR_API_KEY
```

### 2. Base URL
All API requests should be directed to the official API base URL (check the developer dashboard for the production URL, typically `https://api.slant3d.com/v1/`).

### 3. Basic Workflow for Our App

When a user clicks "Generate & Print" in our Parametric 3D Generator:
1. **Generate STL:** The app generates the STL file via Three.js (already partially implemented).
2. **Upload File:** Send a `POST` request to the Slant 3D file upload endpoint with the STL blob.
3. **Create Order:** Once uploaded, send a `POST` request to the ordering endpoint, including the file ID, material choice, color, and shipping details.
4. **Track Status:** Listen to webhook events on our backend to notify the user of their print status.

## Example: Placing an Order

*(Note: Endpoint paths are illustrative; refer to the latest [Slant 3D Documentation](https://slant3dapi.com) for precise endpoint paths).*

```javascript
async function placePrintOrder(fileId, shippingAddress) {
  const apiKey = 'YOUR_API_KEY'; // In a real app, do not hardcode this in the frontend
  
  const orderPayload = {
    file_id: fileId,
    material: "PETG",
    color: "Black",
    quantity: 1,
    shipping_info: shippingAddress
  };

  try {
    const response = await fetch('https://api.slant3d.com/v1/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(orderPayload)
    });

    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Error placing order:", error);
  }
}
```

## Security Considerations

**Never expose your API key in the frontend code.**
Since our Parametric 3D Generator is currently a frontend-only application, you will eventually need to set up a small backend server (e.g., Node.js/Express) to securely handle the API calls to Slant 3D and keep your API key hidden from users.

## Next Steps

1. Register for an API key at Slant 3D.
2. Create a basic backend proxy to handle requests.
3. Connect the "Download STL" button to automatically upload the file via the API.
