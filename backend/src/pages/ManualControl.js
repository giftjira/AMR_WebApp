import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import API_BASE_URL from '../config';
import {
  Box,
  Button,
  Typography,
  Container,
  Paper,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Grid
} from '@mui/material';
import HomeIcon from '@mui/icons-material/Home';

function ManualControl() {
  const navigate = useNavigate();
  const [locations, setLocations] = useState([]);
  const [startSpot, setStartSpot] = useState('');
  const [endSpot, setEndSpot] = useState('');

  useEffect(() => {
    // Fetch locations from backend
    axios.get(`${API_BASE_URL}/api/locations`)
      .then(res => {
        setLocations(res.data);
      })
      .catch(error => {
        console.error('Error fetching locations:', error);
      });
  }, []);

  const handleMove = () => {
    if (startSpot && endSpot) {
      // Find the selected location objects
      const startLocation = locations.find(loc => loc.id === startSpot);
      const endLocation = locations.find(loc => loc.id === endSpot);

      // Send move command to backend
      axios.post(`${API_BASE_URL}/api/manual-control/move`, {
        startSpotId: startLocation.id,
        startSpotName: startLocation.location_name,
        endSpotId: endLocation.id,
        endSpotName: endLocation.location_name
      })
      .then(response => {
        console.log('Move command sent successfully:', response.data);
        // Reset selections after successful move
        setStartSpot('');
        setEndSpot('');
      })
      .catch(error => {
        console.error('Error sending move command:', error);
      });
    }
  };

  return (
    <Container maxWidth="lg">
      <Box sx={{ mt: 4, mb: 4 }}>
        <Paper sx={{ p: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
            <Typography variant="h4" component="h1">
              Manual Control
            </Typography>
            <Button
              variant="contained"
              startIcon={<HomeIcon />}
              onClick={() => navigate('/')}
            >
              Home
            </Button>
          </Box>
          
          <Grid container spacing={3} sx={{ mt: 2 }}>
            <Grid item xs={12} md={4}>
              <Typography variant="subtitle1" sx={{ mb: 1, ml: 0.5 }}>Start Spot</Typography>
              <FormControl fullWidth sx={{ minWidth: 240 }}>
                <Select
                  value={startSpot}
                  onChange={(e) => setStartSpot(e.target.value)}
                  size="medium"
                >
                  {locations.map((location) => (
                    <MenuItem key={location.id} value={location.id}>
                      {location.location_name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={4}>
              <Typography variant="subtitle1" sx={{ mb: 1, ml: 0.5 }}>End Spot</Typography>
              <FormControl fullWidth sx={{ minWidth: 240 }}>
                <Select
                  value={endSpot}
                  onChange={(e) => setEndSpot(e.target.value)}
                  size="medium"
                >
                  {locations.map((location) => (
                    <MenuItem key={location.id} value={location.id}>
                      {location.location_name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={4}></Grid>
            <Grid item xs={12} md={8} sx={{ mt: 4.3, display: 'flex', justifyContent: 'center' }}>
              <Button
                variant="contained"
                color="primary"
                size="large"
                onClick={handleMove}
                disabled={!startSpot || !endSpot}
                sx={{ height: '56px', minWidth: 240 }}
              >
                MOVE
              </Button>
            </Grid>
            <Grid item xs={false} md={2}></Grid>
          </Grid>
        </Paper>
      </Box>
    </Container>
  );
}

export default ManualControl; 