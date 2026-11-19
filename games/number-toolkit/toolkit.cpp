#include <iostream>
#include <cstdlib>
#include <ctime>

// Headers for console input and sleep functionality in Snake game
#ifdef _WIN32
    #include <conio.h>
    #include <windows.h>
#else
    #include <conio.h>
    #include <unistd.h>
    void Sleep(int ms) {
        usleep(ms * 1000);
    }
#endif

using namespace std;

// --- Snake Game Implementation ---
bool gameOver;
const int width = 20;
const int height = 20;
int x, y, fruitX, fruitY, score;
int tailX[100], tailY[100];
int nTail;
enum eDirectVal { STOP = 0, LEFT, RIGHT, UP, DOWN };
eDirectVal dir;

void SetupSnake() {
    gameOver = false;
    dir = STOP;
    x = width / 2;
    y = height / 2;
    fruitX = rand() % width;
    fruitY = rand() % height;
    score = 0;
    nTail = 0;
}

void DrawSnakeBoard() {
    system("cls"); 

    for (int i = 0; i < width + 2; i++)
        cout << "#";
    cout << endl;

    for (int i = 0; i < height; i++) {
        for (int j = 0; j < width; j++) {
            if (j == 0)
                cout << "#"; 

            if (i == y && j == x)
                cout << "O"; 
            else if (i == fruitY && j == fruitX)
                cout << "F"; 
            else {
                bool printTail = false;
                for (int k = 0; k < nTail; k++) {
                    if (tailX[k] == j && tailY[k] == i) {
                        cout << "o"; 
                        printTail = true;
                    }
                }
                if (!printTail)
                    cout << " ";
            }

            if (j == width - 1)
                cout << "#"; 
        }
        cout << endl;
    }

    for (int i = 0; i < width + 2; i++)
        cout << "#";
    cout << endl;

    cout << "Score: " << score << endl;
    cout << "Controls: W (Up), A (Left), S (Down), D (Right), X (Quit)\n";
}

void InputSnake() {
    if (_kbhit()) {
        switch (_getch()) {
        case 'a':
        case 'A':
            if (dir != RIGHT) dir = LEFT;
            break;
        case 'd':
        case 'D':
            if (dir != LEFT) dir = RIGHT;
            break;
        case 'w':
        case 'W':
            if (dir != DOWN) dir = UP;
            break;
        case 's':
        case 'S':
            if (dir != UP) dir = DOWN;
            break;
        case 'x':
        case 'X':
            gameOver = true;
            break;
        }
    }
}

void LogicSnake() {
    int prevX = tailX[0];
    int prevY = tailY[0];
    int prev2X, prev2Y;
    tailX[0] = x;
    tailY[0] = y;

    for (int i = 1; i < nTail; i++) {
        prev2X = tailX[i];
        prev2Y = tailY[i];
        tailX[i] = prevX;
        tailY[i] = prevY;
        prevX = prev2X;
        prevY = prev2Y;
    }

    switch (dir) {
    case LEFT:  x--; break;
    case RIGHT: x++; break;
    case UP:    y--; break;
    case DOWN:  y++; break;
    default: break;
    }

    if (x >= width || x < 0 || y >= height || y < 0)
        gameOver = true;

    for (int i = 0; i < nTail; i++) {
        if (tailX[i] == x && tailY[i] == y)
            gameOver = true;
    }

    if (x == fruitX && y == fruitY) {
        score += 10;
        fruitX = rand() % width;
        fruitY = rand() % height;
        nTail++;
    }
}

void playSnakeGame() {
    srand(static_cast<unsigned int>(time(0)));
    SetupSnake();
    while (!gameOver) {
        DrawSnakeBoard();
        InputSnake();
        LogicSnake();
        Sleep(100); 
    }
    cout << "\nGame Over! Final Score: " << score << "\nReturning to Toolkit Menu...\n";
    system("pause");
}

// --- Logic Gates Simulator ---
void simulateLogicGates() {
    int a, b;
    cout << "\n--- Logic Gates Simulator ---\n";
    cout << "Enter input A (0 or 1): ";
    cin >> a;
    cout << "Enter input B (0 or 1): ";
    cin >> b;

    // Normalize inputs to boolean
    bool boolA = (a != 0);
    bool boolB = (b != 0);

    cout << "\nResults for A = " << (boolA ? 1 : 0) << ", B = " << (boolB ? 1 : 0) << ":\n";
    cout << "----------------------------------------\n";
    cout << "1. AND  (A && B) : " << (boolA && boolB ? 1 : 0) << "\n";
    cout << "2. OR   (A || B) : " << (boolA || boolB ? 1 : 0) << "\n";
    cout << "3. NOT  (!A)     : " << (!boolA ? 1 : 0) << " (for input A)\n";
    cout << "4. XOR  (A ^ B)  : " << (boolA != boolB ? 1 : 0) << "\n";
    cout << "5. NAND          : " << (!(boolA && boolB) ? 1 : 0) << "\n";
    cout << "6. NOR           : " << (!(boolA || boolB) ? 1 : 0) << "\n";
    cout << "----------------------------------------\n";
}

// --- Original Toolkit Functions ---

void displayMenu() { //Displays the options menu. This function does not return a value to the caller. 
    cout << "\nNumber Analysis Toolkit-please choose an option from below:\n";
    cout << "1. Check if number is prime\n";
    cout << "2. Find min and max of 5 numbers\n";
    cout << "3. Calculate factorial\n";
    cout << "4. Convert temperature\n";
    cout << "5. Find a large number's root\n";
    cout << "6. Simulate Logic Gates\n";
    cout << "7. Quit\n" << endl; //Updated menu numbering to accommodate logic gates
    cout << "Enter your choice: ";
}

bool isPrime(int n) { //used boolean to source: https://stackoverflow.com/questions/66411407/c-isprime-function-how-can-i-return-a-boolean-value-from-a-function-that-take
    
    bool isPrime = true;
    if(n < 0)
    cout << "Number must be a positive integer.\n";

  else if(n == 0 || n == 1)//If the integer is 1 or 0, the number is not prime (1 has a single divisor and 0 does not exist)
    isPrime = false;
  else
  {
    for(int divisor = 2; divisor <= n / 2; divisor++)
    //For every integer 2 and greator, variable divdes the caller input by 2, then divides both results again by 2. 
    //If the function determines an integer can be divided by 2 more than once, the integer is returned as not prime.
    {
      if(n % divisor == 0)
      {
        isPrime = false;
        break;
      }
    }
}

return isPrime;

} 

void getMinMax(double arr[], int size, double &min, double &max){ //Used reference parameters instead of simply returning a value. See the bottom of this program to know why.
    min = arr[0];
    max = arr[0];

    for (int i = 1; i < size; ++i) { 
        //For each value typed in the array, it will compare each value with each corresponding integer and determine wether that digit within the array is less than or greater than the min. 
        //If the value is less than the previous for all digits following, the integer is the minimum value.
        //If the value is greater than the previous for all digits following, the integer is the maximmum value.
        if (arr[i] < min) {
            min = arr[i];
        }

        if (arr[i] > max) {
            max = arr[i];
        }
    }

}

int factorial(int n) { //Function to calculate a factorial. Source: https://stackoverflow.com/questions/18090465/recursion-in-c-factorial-program
    if (n <= 1) {
        return 1;
    }
    else{ //Are if/else statements allowed?
    return n * factorial(n - 1);
    }
}

double celsiusToFahrenheit(double c) { //Used formula (c*9/5) +32 to determine a 3-line function to convert an integer into fahrenheit degrees
    return (c * 9.0 / 5.0) + 32.0;
}

int digitalRoot(long long n){ 
    if (n < 0) {
        n = -n;
    }

    while (n > 9) {
        int sum = 0;
        while (n > 0) {
            sum += n % 10;
            n /= 10;
        }
        n = sum;
    }

    return static_cast<int>(n);
}

int main() { 
    int choice;

    do {
        displayMenu();
        cin >> choice;

        switch (choice) { //Uses cases to call each function based on number stored between 1-5, with 1 corresponding to option 1
            case 1: {
                int number;
                cout << "Enter an integer: ";
                cin >> number;

                if (isPrime(number)) {
                    cout << number << " is prime.\n";
                } else {
                    cout << number << " is not prime.\n";
                }
                break;
            }

            case 2: {
                double numbers[5];
                double min, max;

                cout << "Enter 5 numbers:\n";
                for (int i = 0; i < 5; ++i) {
                    cin >> numbers[i];
                }

                getMinMax(numbers, 5, min, max);
                cout << "Minimum: " << min << "\n";
                cout << "Maximum: " << max << "\n";
                break;
            }

            case 3: {
                int number;
                cout << "Enter a number: ";
                cin >> number;

                if (number < 0) {
                    cout << "Factorial is only defined for nonnegative integers.\n";
                } else {
                    cout << number << "! = " << factorial(number) << "\n";
                }

                break;
            }

            case 4: {
                double celsius;
                cout << "Enter temperature in Celsius: ";
                cin >> celsius;

                cout << "Temperature in Fahrenheit: "
                     << celsiusToFahrenheit(celsius) << "\n";
                break;
            }
            case 5: {
                long long number;
                cout << "Enter a large number: ";
                cin >> number;

                int root = digitalRoot(number);
                cout << "The digital root of " << number << " is: " << root << "\n";
                break;
            }

            case 6: {
                simulateLogicGates();
                break;
            }

            case 123456: {
                cout << "\nLaunching Secret Snake Game...\n";
                playSnakeGame();
                break;
            }

            case 7:
                cout << "Goodbye!\n";
                break;

            default:
                cout << "Invalid choice. Please try again.\n";
        }
    } while (choice != 7); //While choice is not equal to 7, loop the displayMenu switch

    return 0;
}