import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import API_BASE_URL from '../config';
import {
  Box,
  Button,
  Typography,
  Container,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Checkbox,
  ListItemText
} from '@mui/material';
import HomeIcon from '@mui/icons-material/Home';

function Virtual() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedEndSpots, setSelectedEndSpots] = useState([]);

  // Key for localStorage
  const STORAGE_KEY = 'virtualSelectedEndSpots';

  useEffect(() => {
    axios.get(`${API_BASE_URL}/api/virtual-data`)
      .then(res => {
        // Flatten the grouped data for table display
        const flatRows = res.data.flatMap(group =>
          group.items.map(item => ({
            id: item.id,
            end_spot: group.end_spot,
            status_end: item.status_end
          }))
        );
        setRows(flatRows);
        // Get all unique spots
        const allSpots = Array.from(new Set(flatRows.map(row => row.end_spot)));
        // Try to load from localStorage
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            // Only keep values that are still valid
            const valid = parsed.filter(v => allSpots.includes(v));
            setSelectedEndSpots(valid.length ? valid : allSpots);
          } catch {
            setSelectedEndSpots(allSpots);
          }
        } else {
          setSelectedEndSpots(allSpots);
        }
        setLoading(false);
      })
      .catch(err => {
        setError('Failed to fetch data');
        setLoading(false);
      });
  }, []);

  // Get unique end_spot values for dropdown
  const endSpotOptions = Array.from(new Set(rows.map(row => row.end_spot)));

  // Multi-select handler
  const handleFilterChange = (event) => {
    const value = event.target.value;
    let newSelected;
    if (value.includes('All')) {
      newSelected = endSpotOptions;
    } else {
      newSelected = value;
    }
    setSelectedEndSpots(newSelected);
    // Save to localStorage
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newSelected));
  };

  // Save to localStorage if endSpotOptions change and selection is out of sync
  useEffect(() => {
    if (endSpotOptions.length && selectedEndSpots.length) {
      // Remove any selected spots that are no longer valid
      const valid = selectedEndSpots.filter(v => endSpotOptions.includes(v));
      if (valid.length !== selectedEndSpots.length) {
        setSelectedEndSpots(valid);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(valid));
      }
    }
  }, [endSpotOptions]);

  // Filtered rows
  const filteredRows = selectedEndSpots.length === endSpotOptions.length
    ? rows
    : rows.filter(row => selectedEndSpots.includes(row.end_spot));

  const handleReady = (row) => {
    axios.post(`${API_BASE_URL}/api/virtual-update-status`, {
      id: row.id,
      end_spot: row.end_spot,
      status_end: 'Ready'
    })
    .then((response) => {
      // Log the backend response
      console.log('Backend response:', response.data);

      // Optionally, refresh data or update the row in state
      setRows(prevRows =>
        prevRows.map(r =>
          r.id === row.id && r.end_spot === row.end_spot
            ? { ...r, status_end: 'Ready' }
            : r
        )
      );
    })
    .catch(err => {
      // Optionally, show error
      console.error('Failed to update status:', err);
    });
  };

  return (
    <Container maxWidth="lg">
      <Box sx={{ mt: 4, mb: 4 }}>
        <Paper sx={{ p: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
            <Typography variant="h4" component="h1">
              Virtual
            </Typography>
            <Button
              variant="contained"
              startIcon={<HomeIcon />}
              onClick={() => navigate('/')}
            >
              Home
            </Button>
          </Box>
          {/* Multi-select Filter Dropdown */}
          <Box sx={{ mb: 3, maxWidth: 400 }}>
            <FormControl fullWidth size="small">
              <InputLabel>Filter by End Spot</InputLabel>
              <Select
                multiple
                value={selectedEndSpots.length === endSpotOptions.length ? ['All'] : selectedEndSpots}
                onChange={handleFilterChange}
                renderValue={(selected) => {
                  if (selected.includes('All') || selected.length === endSpotOptions.length) {
                    return 'All';
                  }
                  return selected.join(', ');
                }}
                label="Filter by End Spot"
              >
                <MenuItem value="All">
                  <Checkbox checked={selectedEndSpots.length === endSpotOptions.length} />
                  <ListItemText primary="All" />
                </MenuItem>
                {endSpotOptions.map(option => (
                  <MenuItem key={option} value={option}>
                    <Checkbox checked={selectedEndSpots.includes(option)} />
                    <ListItemText primary={option} />
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
          {loading ? (
            <Typography>Loading...</Typography>
          ) : error ? (
            <Typography color="error">{error}</Typography>
          ) : (
            <TableContainer component={Paper}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 'bold' }}>End Spot</TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }}>Status End</TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }}>Action</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredRows.map((row) => (
                    <TableRow key={`${row.id}-${row.end_spot}`}>
                      <TableCell>{row.end_spot}</TableCell>
                      <TableCell>{row.status_end}</TableCell>
                      <TableCell>
                        <Button
                          variant="contained"
                          color="success"
                          size="small"
                          sx={{ mr: 1 }}
                          onClick={() => handleReady(row)}
                        >
                          Ready
                        </Button>
                        <Button
                          variant="contained"
                          color="error"
                          size="small"
                        >
                          Cancel
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Paper>
      </Box>
    </Container>
  );
}

export default Virtual; 