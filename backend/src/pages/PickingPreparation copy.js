import React, { useEffect, useState } from 'react';
import axios from 'axios';
import API_BASE_URL from '../config';
import { useNavigate } from 'react-router-dom';
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
  Select,
  MenuItem,
  Checkbox,
  ListItemText,
  OutlinedInput
} from '@mui/material';
import HomeIcon from '@mui/icons-material/Home';
import CheckBoxOutlineBlankIcon from '@mui/icons-material/CheckBoxOutlineBlank';
import CheckBoxIcon from '@mui/icons-material/CheckBox';

const BLUE_LIGHT = '#e3f2fd';

const MENU_PROPS = {
  PaperProps: {
    style: {
      maxHeight: 300,
    },
  },
  disableAutoFocusItem: true,
};

function PickingPreparation() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [dropdowns, setDropdowns] = useState({});
  const [filterOptions, setFilterOptions] = useState([]);
  const [selectedFilters, setSelectedFilters] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchData = () => {
    setLoading(true);
    return axios.get(`${API_BASE_URL}/api/packing-preparation`)
      .then(res => {
        setRows(res.data);
        const initialDropdowns = {};
        res.data.forEach(row => {
          initialDropdowns[row.id] = row.selected_start_spot;
        });
        setDropdowns(initialDropdowns);
        const allStartSpots = res.data.flatMap(row => [row.start_spot1, row.start_spot2, row.start_spot3]).filter(Boolean);
        const uniqueStartSpots = Array.from(new Set(allStartSpots));
        setFilterOptions(uniqueStartSpots);
        const saved = localStorage.getItem('packingPrepSelectedFilters');
        if (saved) {
          const parsed = JSON.parse(saved);
          const valid = parsed.filter(v => uniqueStartSpots.includes(v));
          setSelectedFilters(valid.length ? valid : uniqueStartSpots);
        } else {
          setSelectedFilters(uniqueStartSpots);
        }
      })
      .catch(error => {
        console.error('Failed to fetch data:', error);
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Save selectedFilters to localStorage whenever it changes
  useEffect(() => {
    if (filterOptions.length) {
      localStorage.setItem('packingPrepSelectedFilters', JSON.stringify(selectedFilters));
    }
  }, [selectedFilters, filterOptions]);

  const handleDropdownChange = (id, value) => {
    setDropdowns(prev => ({ ...prev, [id]: value }));

    // Find the row for this id
    const row = rows.find(r => r.id === id);
    if (!row) return;

    // Send update to backend
    axios.post(`${API_BASE_URL}/api/packing-preparation/update-selected-start-spot`, {
      id: row.id,
      end_spot: row.end_spot,
      selectedName: value
    })
    .then(() => {
      // Optionally, show a success message or update UI
    })
    .catch(err => {
      // Optionally, show an error message
      console.error('Failed to update selected start spot:', err);
    });
  };

  // Filtered rows based on selected Start Spots
  const filteredRows = rows.filter(row => selectedFilters.includes(dropdowns[row.id] || row.start_spot1));

  // Handler for dropdown with checkboxes
  const handleFilterChange = (event) => {
    const value = event.target.value;
    if (value.includes('All')) {
      // If 'All' is selected, select all
      setSelectedFilters(filterOptions);
    } else {
      setSelectedFilters(value);
    }
  };

  const handleReadyClick = (row) => {
    setLoading(true);
    // Determine new status
    const hasMB = [row.end_spot1, row.end_spot2, row.end_spot3].some(spot => spot && spot.includes('MB'));
    const newStatus = hasMB ? 'Empty' : 'Ready';
    const selectedStartSpot = dropdowns[row.id] || row.start_spot1;

    // Get current time in hh:mm:ss
    const now = new Date();
    const lastServe = now.toLocaleTimeString('en-GB', { hour12: false });

    // Update backend
    axios.post(`${API_BASE_URL}/api/packing-preparation/update-status`, {
      id: row.id,
      status_start: newStatus,
      last_serve: lastServe,
      start_spot: selectedStartSpot,
      end_spot: row.end_spot
    })
    .then(() => {
      // Force a fresh data fetch
      return axios.get(`${API_BASE_URL}/api/packing-preparation`);
    })
    .then(res => {
      // Update all states with fresh data
      setRows(res.data);
      const initialDropdowns = {};
      res.data.forEach(row => {
        initialDropdowns[row.id] = row.selected_start_spot;
      });
      setDropdowns(initialDropdowns);
    })
    .catch(error => {
      console.error('Failed to update/fetch data:', error);
    })
    .finally(() => {
      setLoading(false);
    });
  };

  return (
    <Container maxWidth="lg">
      <Box sx={{ mt: 4, mb: 4 }}>
        <Paper sx={{ p: 3 }}>
          {loading && (
            <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, bgcolor: 'rgba(255,255,255,0.7)', zIndex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
              <Typography>Loading...</Typography>
            </Box>
          )}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
            <Typography variant="h4" component="h1">
              Packing Preparation
            </Typography>
            <Button
              variant="contained"
              startIcon={<HomeIcon />}
              onClick={() => navigate('/')}
            >
              Home
            </Button>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6" sx={{ mr: 2 }}>Filter</Typography>
            <Select
              multiple
              displayEmpty
              value={selectedFilters.length === filterOptions.length ? ['All'] : selectedFilters}
              onChange={handleFilterChange}
              input={<OutlinedInput />}
              renderValue={(selected) => {
                if (selected.includes('All') || selected.length === filterOptions.length) {
                  return 'All';
                }
                return selected.join(', ');
              }}
              sx={{ minWidth: 300 }}
              size="small"
              MenuProps={MENU_PROPS}
            >
              <MenuItem value="All">
                <Checkbox checked={selectedFilters.length === filterOptions.length} />
                <ListItemText primary="All" />
              </MenuItem>
              {filterOptions.map(option => (
                <MenuItem key={option} value={option}>
                  <Checkbox checked={selectedFilters.includes(option)} />
                  <ListItemText primary={option} />
                </MenuItem>
              ))}
            </Select>
          </Box>
          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontSize: '1.2rem', fontWeight: 'bold' }}>Last Serve</TableCell>
                  <TableCell sx={{ fontSize: '1.2rem', fontWeight: 'bold' }}>Start Spot</TableCell>
                  <TableCell sx={{ fontSize: '1.2rem', fontWeight: 'bold' }}>End Spot</TableCell>
                  <TableCell sx={{ fontSize: '1.2rem', fontWeight: 'bold' }}>Status</TableCell>
                  <TableCell sx={{ fontSize: '1.2rem', fontWeight: 'bold' }}>Action Button</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredRows.map(row => {
                  const isMB = [row.end_spot1, row.end_spot2, row.end_spot3].some(spot => spot && spot.includes('MB'));
                  return (
                    <TableRow key={row.id} style={
                      isMB ? { background: BLUE_LIGHT } : {}
                    }>
                      <TableCell sx={{ fontSize: '1.1rem' }}>{row.last_serve}</TableCell>
                      <TableCell sx={{ fontSize: '1.1rem' }}>
                        <Select
                            value={dropdowns[row.id] || row.start_spot1}
                            onChange={e => handleDropdownChange(row.id, e.target.value)}
                            size="medium"
                            sx={{ fontSize: '1.1rem', minWidth: 140 }}
                          >
                            {[row.start_spot1, row.start_spot2, row.start_spot3].filter(Boolean).map((spot, idx) => (
                              <MenuItem key={idx} value={spot} sx={{ fontSize: '1.1rem' }}>{spot}</MenuItem>
                            ))}
                          </Select>
                      </TableCell>
                      <TableCell sx={{ fontSize: '1.1rem' }}>{row.end_spot}</TableCell>
                      <TableCell
                        sx={{
                          fontSize: '1.1rem',
                          backgroundColor:
                            row.status_start === '-' ? '#e0e0e0' :
                            row.status_start === 'Waiting' ? '#90caf9' :
                            (row.status_start === 'Prepare' || row.status_start === 'In Use') ? '#fff59d' :
                            (row.status_start === 'Ready' || row.status_start === 'Empty') ? '#ffcc80' :
                            undefined
                        }}
                      >
                        {row.status_start}
                      </TableCell>
                      <TableCell>
                        {(row.status_start === 'Prepare' || row.status_start === 'In Use') && (
                          <>
                            <Button variant="contained" color="success" size="large" sx={{ mr: 2, fontSize: '1.1rem', px: 4, py: 1.5 }} onClick={() => handleReadyClick(row)}>Ready</Button>
                            <Button variant="contained" color="error" size="large" sx={{ fontSize: '1.1rem', px: 4, py: 1.5 }}>Cancel</Button>
                          </>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      </Box>
    </Container>
  );
}

export default PickingPreparation; 