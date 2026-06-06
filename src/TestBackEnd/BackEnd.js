async function callMyBackend() {
    const response = await fetch('http://localhost:3000/api/hello');
    
    // Read as plain text first to safely inspect it
    const text = await response.text(); 
    console.log("Raw Server Response:", text); 

    // Only parse if you know it's valid JSON
    // const data = JSON.parse(text); 
}
callMyBackend();
