class ApiResponse {
  constructor(statusCode, data, message = "Success") {
    this.success = statusCode < 400;
    this.data = data;
    this.message = message;
    this.statusCode = statusCode;
  }
}

export { ApiResponse };
