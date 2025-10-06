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

function ParePreparation() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [dropdowns, setDropdowns] = useState({});
  const [filterOptions, setFilterOptions] = useState([]);
  const [selectedFilters, setSelectedFilters] = useState([]);

  useEffect(() => {
    axios.get(`${API_BASE_URL}/api/pare-preparation`)
      .then(res => {
        setRows(res.data);
        // Set default dropdowns to end_spot1 for each row
        const initialDropdowns = {};
        res.data.forEach(row => {
          initialDropdowns[row.id] = row.selected_end_spot;
        });
        setDropdowns(initialDropdowns);
        // Set filter options and default selection
        const uniqueStartSpots = Array.from(new Set(res.data.map(row => row.start_spot)));
        setFilterOptions(uniqueStartSpots);
        // Try to load from localStorage
        const saved = localStorage.getItem('parePrepSelectedFilters');
        if (saved) {
          const parsed = JSON.parse(saved);
          // Only keep values that are still valid
          const valid = parsed.filter(v => uniqueStartSpots.includes(v));
          setSelectedFilters(valid.length ? valid : uniqueStartSpots);
        } else {
          setSelectedFilters(uniqueStartSpots); // Default: all selected
        }
      });
  }, []);

  // Save selectedFilters to localStorage whenever it changes
  useEffect(() => {
    if (filterOptions.length) {
      localStorage.setItem('parePrepSelectedFilters', JSON.stringify(selectedFilters));
    }
  }, [selectedFilters, filterOptions]);

  const handleDropdownChange = (id, value) => {
    setDropdowns(prev => ({ ...prev, [id]: value }));

    // Find the row for this id
    const row = rows.find(r => r.id === id);
    if (!row) return;

    // Send update to backend
    axios.post(`${API_BASE_URL}/api/pare-preparation/update-selected-end-spot`, {
      id: row.id,
      start_spot: row.start_spot,
      selectedName: value
    })
    .then(() => {
      // Optionally, show a success message or update UI
    })
    .catch(err => {
      // Optionally, show an error message
      console.error('Failed to update selected end spot:', err);
    });
  };

  // Filtered rows based on selected Start Spots
  const filteredRows = rows.filter(row => selectedFilters.includes(row.start_spot));

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
    // Determine new status
    const hasMB = [row.end_spot1, row.end_spot2, row.end_spot3].some(spot => spot && spot.includes('MB'));
    const newStatus = hasMB ? 'Empty' : 'Ready';

    // Get selected end spot from dropdown (or default)
    const selectedEndSpot = dropdowns[row.id] || row.end_spot1;

    // Update backend
    axios.post(`${API_BASE_URL}/api/pare-preparation/update-status`, {
      id: row.id,
      status_start: newStatus,
      start_spot: row.start_spot,
      end_spot: selectedEndSpot
    }).then(() => {
      // Update UI state
      setRows(prevRows => prevRows.map(r =>
        r.id === row.id ? { ...r, status_start: newStatus } : r
      ));
    });
  };

  return (
    <Container maxWidth="lg">
      <Box sx={{ mt: 4, mb: 4 }}>
        <Paper sx={{ p: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
            <Typography variant="h4" component="h1">
              Part Preparation
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
                    <TableRow key={row.id} style={isMB ? { background: BLUE_LIGHT } : {}}>
                      <TableCell sx={{ fontSize: '1.1rem' }}>{row.start_spot}</TableCell>
                      <TableCell sx={{ fontSize: '1.1rem' }}>
                        <Select
                          value={dropdowns[row.id] || row.end_spot1}
                          onChange={e => handleDropdownChange(row.id, e.target.value)}
                          size="medium"
                          sx={{ fontSize: '1.1rem', minWidth: 140 }}
                        >
                          {[row.end_spot1, row.end_spot2, row.end_spot3].filter(Boolean).map((spot, idx) => (
                            <MenuItem key={idx} value={spot} sx={{ fontSize: '1.1rem' }}>{spot}</MenuItem>
                          ))}
                        </Select>
                      </TableCell>
                      <TableCell
                        sx={{
                          fontSize: '1.1rem',
                          backgroundColor:
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

export default ParePreparation; 