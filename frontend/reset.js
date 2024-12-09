document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("forgot-password-form");

    form.addEventListener("submit", async (event) => {
        event.preventDefault();

        const email = document.getElementById("email").value.trim();

        if (!email) {
            alert("Please enter a valid email address.");
            return;
        }

        try {
            const response = await fetch('http://localhost:3000/request-reset', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email }),
            });

            if (response.ok) {
                const result = await response.json();
                alert(result.message || 'Reset link sent! Please check your email.');
            } else {
                const error = await response.json();
                alert(error.message || 'Something went wrong. Please try again later.');
            }
        } catch (error) {
            console.error('Error:', error);
            alert('An unexpected error occurred. Please try again later.');
        }
    });
});
