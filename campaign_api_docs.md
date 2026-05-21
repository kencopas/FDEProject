# Campaign API - Swagger UI

### 1. GET `/health`

- **Summary:** Health
- **Description:** Health check endpoint.
- **Parameters:** None
- **Request Body:** None
- **Responses:**
  - 200: Successful Response (application/json)

---

### 2. POST `/next-day`

- **Summary:** Next Day
- **Description:** Advances to the next day (purpose inferred from name).
- **Parameters:** None
- **Request Body:** None
- **Responses:**
  - 200: Successful Response (application/json)

---

### 3. GET `/campaigns`

- **Summary:** List Campaigns
- **Description:** Retrieves a list of campaigns.
- **Parameters:**
  - `page` (query, integer, optional, default: 1): Page number (min: 1)
  - `page_size` (query, integer, optional, default: 10): Page size (min: 1, max: 10)
  - `status` (query, string, optional): Status filter
  - `x-api-key` (header, string, optional): API key for authentication
- **Request Body:** None
- **Responses:**
  - 200: Successful Response (application/json)
  - 422: Validation Error (application/json, schema: HTTPValidationError)

---

### 4. GET `/campaigns/{campaign_id}`

- **Summary:** Get Campaign
- **Description:** Retrieves a campaign by its ID.
- **Parameters:**
  - `campaign_id` (path, string, required): Campaign ID
  - `x-api-key` (header, string, optional): API key for authentication
- **Request Body:** None
- **Responses:**
  - 200: Successful Response (application/json)
  - 422: Validation Error (application/json, schema: HTTPValidationError)

---

### 5. GET `/api-docs`

- **Summary:** Api Docs
- **Description:** Returns API documentation.
- **Parameters:** None
- **Request Body:** None
- **Responses:**
  - 200: Successful Response (text/plain)

---

### Schemas

- **HTTPValidationError**
  - `detail`: array of `ValidationError` objects

- **ValidationError**
  - `loc`: array of string/integer (location of the error)
  - `msg`: string (error message)
  - `type`: string (error type)
