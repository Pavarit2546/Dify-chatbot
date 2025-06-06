import express from 'express';
import routes from './routes/index.js';
import cors from 'cors'; 

const app = express();

app.use(cors({
  origin: 'http://localhost:3001'
}));

app.use(express.json());
app.use('/api', routes);

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

export default app;