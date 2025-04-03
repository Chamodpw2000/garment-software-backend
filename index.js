import express from 'express';
import orderRoute from './routes/orderRoute.js';

import cors from 'cors';




const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
    res.send('Garmennt Cutting APplication Backend Running Successfully');
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    
});

app.use('/api/orders', orderRoute); 
