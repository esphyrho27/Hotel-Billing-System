import axios from "axios";
const api = axios.create({ baseURL: process.env.NEXT_PUBLIC_API_URL || "/api/index.php", timeout: 15000, headers: { "Content-Type": "application/json" }, withCredentials: true });
api.interceptors.response.use((response) => response, (error) => Promise.reject(new Error(error.response?.data?.error || error.message || "Network request failed")));
export default api;
