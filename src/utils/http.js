/**
 * HTTP Utility Functions
 * Standardized responses and headers
 */

export function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json'
  };
}

export function successResponse(data, status = 200) {
  return new Response(JSON.stringify({
    success: true,
    data,
    timestamp: new Date().toISOString()
  }), {
    status,
    headers: corsHeaders()
  });
}

export function errorResponse(message, status = 400, code = null) {
  return new Response(JSON.stringify({
    success: false,
    error: {
      message,
      code: code || `ERROR_${status}`,
      timestamp: new Date().toISOString()
    }
  }), {
    status,
    headers: corsHeaders()
  });
}